# REST API сервера BankInvest

Базовый адрес: `http://<сервер>:8787/api`.
Формат: JSON (`Content-Type: application/json`), кодировка UTF-8.

Аутентификация: после входа сервер выдаёт `token`; его нужно передавать заголовком

```
Authorization: Bearer <token>
```

Ошибки всегда в одном формате, а `key` — это ключ словаря (`server/src/i18n.json`),
поэтому клиент показывает текст на выбранном языке (ru/en/be):

```json
{ "error": { "key": "e.own" } }
```

Коды ответов: `200` — успех, `400` — нарушено бизнес-правило, `401` — нет/просрочен токен,
`403` — нет прав, `404` — не найдено, `500` — внутренняя ошибка.

---

## Служебные

| Метод | Путь | Описание |
|---|---|---|
| GET | `/health` | версия, время, путь к файлу базы |
| GET | `/ping` | проверка связи: число бумаг/клиентов/сессий, ваша сессия (если токен передан) |
| GET | `/i18n` | словари интерфейса: `{ languages: ["ru","en","be"], dict: { key: ["ru","en","be"] } }` |

## Аутентификация и сессия

### POST `/auth/login`
```json
{ "id": "client", "password": "client123", "mode": "user" }
```
`mode`: `"user"` — вкладка «ID пользователя», `"company"` — «ID организации» (УНП).
Ответ:
```json
{ "token": "…", "login": "client", "role": "Client", "clientId": 1,
  "clientName": "ООО «Вектор Плюс»", "lang": 0, "isStaff": false, "isAdmin": false }
```

| Метод | Путь | Описание |
|---|---|---|
| POST | `/auth/register` | регистрация; тело: `kind` (`company`/`personal`), `name`, `address`, `contacts`, `password`, `password2`, `unp` (для предприятия) или `login` (для физлица) |
| GET | `/auth/me` | текущая сессия |
| POST | `/auth/logout` | завершить сессию (токен становится недействительным) |
| POST | `/lang` | `{ "lang": 0|1|2 }` — язык сессии (ru/en/be) |

## Главная страница и профиль

| Метод | Путь | Описание |
|---|---|---|
| GET | `/home` | KPI (`kpis[{key,value,accent}]`), списки выросших и упавших бумаг (`up`, `down`) |
| GET | `/profile` | профиль клиента (для роли Client) |

## Клиенты (сотрудник/админ)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/clients` | список клиентов с УНП, адресом, счётом депо |
| GET | `/clients/lite` | `[{Id,Name}]` — для выпадающих списков (доступно всем ролям) |
| POST | `/clients` | новый клиент: `{ name, unp, address, contacts, password }` — создаёт клиента, счёт депо и учётную запись |
| DELETE | `/clients/:id` | удалить клиента (только админ, каскадно) |

## Портфель

| Метод | Путь | Описание |
|---|---|---|
| GET | `/portfolio?clientId=1` | строки портфеля + итоги. Для клиента `clientId` игнорируется (берётся из сессии) |
| POST | `/portfolio/targets` | `{ clientId, rows: [{ id, targetPct }] }` — сохранить целевые доли (сумма ≤ 100 %) |
| POST | `/portfolio/holdings` | `{ symbol, qty, clientId }` — добавить актив (сотрудник) |

Ответ `/portfolio`:
```json
{ "rows": [ { "Id": 7, "Symbol": "ASB-EQ-BNB", "Name": "…", "Segment": "Equities",
              "Qty": 25000, "ForSale": 3000, "Price": 14.28, "ExpenseRatio": 0.3,
              "CurrentValue": 357000, "TargetPct": null, "CurrentPct": 12.71,
              "TargetValue": 0, "Amount": -357000 } ],
  "total": 2810690, "targetValue": 0, "targetPctSum": 0, "diff": -2810690 }
```

## Бумаги и график

| Метод | Путь | Описание |
|---|---|---|
| GET | `/securities` | размещённые бумаги `[{Id,Symbol,Name}]` |
| GET | `/stock/:symbol` | карточка бумаги (эмитент, номинал, ставка, объём, цена, PrevPrice) |
| GET | `/stock/:symbol/chart?grain=0..4` | точки графика. `0` — 48 ч по часам, `1` — 30 дней, `2` — 26 недель, `3` — 24 месяца, `4` — годы |
| GET | `/offers?security=ASB-EQ-BNB&clientId=1` | предложения продавцов (свои исключаются) |
| GET | `/my-offers` | свои активные предложения |
| GET | `/sellable?clientId=1` | бумаги, свободные к продаже (`Free` = остаток − уже выставлено) |

## Торговля

| Метод | Путь | Тело | Описание |
|---|---|---|---|
| POST | `/trade/buy` | `{ listingId, qty, clientId? }` | покупка по предложению. Ответ: `{ qty, symbol, price, amount, commission, total }` |
| POST | `/trade/sell` | `{ securityId, qty, price, clientId? }` | выставить на продажу. Ответ: `{ symbol, qty, price, amount, commission, receive }` |
| POST | `/trade/withdraw` | `{ listingId, clientId? }` | отозвать своё предложение |

Правила (проверяются на сервере, коды ошибок — ключи словаря):

| Ключ | Когда |
|---|---|
| `e.nolisting` | предложение не найдено или уже не активно |
| `e.own` | попытка купить собственное предложение |
| `e.qty` | количество ≤ 0 или больше доступного |
| `e.noaccount` | нет счёта депо |
| `e.sellerqty` | у продавца не хватает бумаг |
| `e.free` | продажа больше свободного остатка |
| `e.price` | цена вне коридора 0,3–3 × рыночная |

## Транзакции, проекты, отчёты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/transactions?clientId=1` | история операций (клиент — только свои) |
| GET | `/projects` | инвест-проекты + `NPV`, `IRR`, `PI`, `Payback` |
| POST | `/projects` | `{ name, rate, cashFlows: "-1000;300;400" }` |
| GET | `/report` | показатели за 30 дней: `r.ops`, `r.income`, `r.top:<символ>` |

## Администрирование (только Admin)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/users` | учётные записи |
| POST | `/users` | `{ login, password, role: "Employee"|"Admin" }` |
| DELETE | `/users/:id` | удалить учётную запись (свой аккаунт удалить нельзя — `e.self`) |
| GET | `/audit` | журнал действий (500 последних записей) |

## Журнал и события

| Метод | Путь | Описание |
|---|---|---|
| POST | `/audit` | `{ action, details }` — записать действие в журнал (используется десктопом при экспорте) |
| GET | `/events?token=…` | **server-sent events**. Сообщения: `hello`, `changed` (`action`, `details`, `user`), `prices` (`added`) |

Пример чтения событий:

```bash
curl -N "http://localhost:8787/api/events?token=<token>"
# data: {"type":"hello","at":"2026-11-23 13:40:00","user":"client"}
# data: {"type":"changed","action":"Покупка по предложению","details":"ASB-EQ-MTS x10 @ 8.38","user":"admin","at":"…"}
```

## Пример: полный сценарий из консоли

```bash
TOKEN=$(curl -s -X POST localhost:8787/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"id":"client","password":"client123","mode":"user"}' | jq -r .token)

curl -s localhost:8787/api/portfolio -H "authorization: Bearer $TOKEN" | jq '.total'
curl -s localhost:8787/api/offers    -H "authorization: Bearer $TOKEN" | jq '.[0]'
curl -s -X POST localhost:8787/api/trade/buy -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"listingId":2,"qty":10}'
```
