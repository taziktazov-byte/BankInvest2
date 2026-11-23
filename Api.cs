using System.Data;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using static BankInvest.Loc;

namespace BankInvest;

// Обмен с сервером BankInvest (server/src/server.js).
// Десктопная и веб-версия работают с одной и той же базой через один REST API,
// поэтому сделка, оформленная в браузере, сразу видна в приложении и наоборот.
public static class Api
{
    // Настройки хранятся в %AppData%\BankInvest, чтобы не пересобирать программу
    // при переносе сервера на другой компьютер.
    static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "BankInvest");
    static readonly string UrlPath = Path.Combine(Dir, "server.txt");
    static readonly string TokenPath = Path.Combine(Dir, "token.txt");

    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };
    static readonly HttpClient StreamHttp = new() { Timeout = Timeout.InfiniteTimeSpan };

    public static string BaseUrl { get; private set; } = LoadUrl();
    public static string Token { get; private set; } = LoadToken();
    public static JsonObject? Me { get; private set; }
    public static string Version = "";

    /// <summary>Событие сервера: "changed" (кто-то изменил данные) или "prices".</summary>
    public static event Action<string, string>? ServerEvent;

    static CancellationTokenSource? cts;
    static bool listening;

    // ---------- настройки ----------
    static string LoadUrl()
    {
        try
        {
            var env = Environment.GetEnvironmentVariable("BANKINVEST_SERVER");
            if (!string.IsNullOrWhiteSpace(env)) return env.Trim().TrimEnd('/');
        }
        catch { }
        try
        {
            if (File.Exists(UrlPath))
            {
                var s = File.ReadAllText(UrlPath).Trim();
                if (s.Length > 0) return s.TrimEnd('/');
            }
        }
        catch { }
        return "http://localhost:8787";
    }

    static string LoadToken()
    {
        try { return File.Exists(TokenPath) ? File.ReadAllText(TokenPath).Trim() : ""; } catch { return ""; }
    }

    public static void SetBaseUrl(string url)
    {
        BaseUrl = url.Trim().TrimEnd('/');
        try { Directory.CreateDirectory(Dir); File.WriteAllText(UrlPath, BaseUrl); } catch { }
    }

    static void SaveToken(string token)
    {
        Token = token;
        try
        {
            Directory.CreateDirectory(Dir);
            if (token.Length == 0) File.Delete(TokenPath); else File.WriteAllText(TokenPath, token);
        }
        catch { }
    }

    // ---------- низкий уровень ----------
    static JsonNode Send(HttpMethod method, string path, JsonNode? body = null)
    {
        using var req = new HttpRequestMessage(method, BaseUrl + "/api" + path);
        if (Token.Length > 0) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        req.Headers.Add("X-BankInvest-Client", "desktop");
        if (body != null) req.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");

        HttpResponseMessage res;
        try { res = Http.Send(req); }
        catch (Exception ex)
        {
            throw new Exception(T("err.db") + "\n" + BaseUrl + "\n\n" + ex.Message);
        }

        using (res)
        {
            var txt = res.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            JsonNode? node = null;
            try { if (txt.Length > 0) node = JsonNode.Parse(txt); } catch { }
            if (!res.IsSuccessStatusCode)
            {
                var key = node?["error"]?["key"]?.GetValue<string>();
                if (res.StatusCode == System.Net.HttpStatusCode.Unauthorized) SaveToken("");
                throw new Exception(key != null ? T(key) : "HTTP " + (int)res.StatusCode);
            }
            return node ?? new JsonObject();
        }
    }

    static JsonNode Body(object o) => JsonSerializer.SerializeToNode(o) ?? new JsonObject();

    // ---------- публичные вызовы ----------
    public static JsonNode Get(string path) => Send(HttpMethod.Get, path);
    public static JsonNode Post(string path, object body) => Send(HttpMethod.Post, path, Body(body));
    public static JsonNode Delete(string path) => Send(HttpMethod.Delete, path);

    /// <summary>Проверка связи с сервером (используется на старте).</summary>
    public static JsonNode Ping()
    {
        var r = Get("/ping");
        Version = r["app"]?.ToString() ?? "";
        return r;
    }

    /// <summary>Вход: возвращает объект сессии и запоминает токен.</summary>
    public static JsonObject Login(string id, string password, bool company)
    {
        var res = Send(HttpMethod.Post, "/auth/login", Body(new { id, password, mode = company ? "company" : "user" })) as JsonObject
                  ?? throw new Exception(T("login.fail"));
        SaveToken(res["token"]?.GetValue<string>() ?? "");
        Me = res;
        ApplySession(res);
        StartListening();
        return res;
    }

    /// <summary>Восстановление сессии по сохранённому токену (если сервер ещё помнит его).</summary>
    public static bool TryRestore()
    {
        if (Token.Length == 0) return false;
        try
        {
            var me = Get("/auth/me") as JsonObject;
            if (me == null) return false;
            Me = me;
            ApplySession(me);
            StartListening();
            return true;
        }
        catch { SaveToken(""); return false; }
    }

    static void ApplySession(JsonObject me)
    {
        Session.Login = me["login"]?.GetValue<string>() ?? "";
        Session.Role = me["role"]?.GetValue<string>() ?? "Client";
        var cid = me["clientId"];
        Session.ClientId = cid == null ? null : cid.GetValue<int>();
        Session.ClientName = me["clientName"]?.GetValue<string>() ?? "";
    }

    public static void Logout()
    {
        try { if (Token.Length > 0) Post("/auth/logout", new { }); } catch { }
        SaveToken("");
        Me = null;
        StopListening();
    }

    public static void SetLang(int lang)
    {
        try { if (Token.Length > 0) Send(HttpMethod.Post, "/lang", Body(new { lang })); } catch { }
    }

    // ---------- живые обновления ----------
    public static void StartListening()
    {
        if (listening) return;          // одно соединение на приложение
        StopListening();
        cts = new CancellationTokenSource();
        listening = true;
        var ct = cts.Token;
        var url = BaseUrl;
        var token = Token;
        Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    using var req = new HttpRequestMessage(HttpMethod.Get, url + "/api/events?token=" + Uri.EscapeDataString(token));
                    req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
                    using var res = await StreamHttp.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
                    if (!res.IsSuccessStatusCode) { await Task.Delay(4000, ct); continue; }
                    using var stream = await res.Content.ReadAsStreamAsync(ct);
                    using var reader = new StreamReader(stream);
                    string? line;
                    while (!ct.IsCancellationRequested && (line = await reader.ReadLineAsync()) != null)
                    {
                        if (!line.StartsWith("data:")) continue;
                        var payload = line.Substring(5).Trim();
                        try
                        {
                            var o = JsonNode.Parse(payload) as JsonObject;
                            var type = o?["type"]?.GetValue<string>() ?? "";
                            var user = o?["user"]?.GetValue<string>() ?? "";
                            if (type is "changed" or "prices") ServerEvent?.Invoke(type, user);
                        }
                        catch { }
                    }
                }
                catch { }
                try { await Task.Delay(4000, ct); } catch { return; }
            }
        }, ct);
    }

    public static void StopListening()
    {
        try { cts?.Cancel(); } catch { }
        cts = null;
        listening = false;
    }

    // ---------- JSON -> DataTable (для DataGridView) ----------
    public static DataTable Table(string path) => ToTable(Get(path));
    public static DataTable Table(JsonNode node) => ToTable(node);

    public static DataTable ToTable(JsonNode? node)
    {
        var t = new DataTable();
        if (node is not JsonArray arr || arr.Count == 0) return t;

        var keys = new List<string>();
        foreach (var item in arr)
            if (item is JsonObject o)
                foreach (var kv in o)
                    if (!keys.Contains(kv.Key)) keys.Add(kv.Key);

        foreach (var k in keys) t.Columns.Add(k, Infer(arr, k));
        foreach (var item in arr)
        {
            if (item is not JsonObject o) continue;
            var row = t.NewRow();
            foreach (var k in keys)
            {
                var v = o[k];
                row[k] = v == null ? DBNull.Value : ToValue(v, t.Columns[k]!.DataType);
            }
            t.Rows.Add(row);
        }
        return t;
    }

    static Type Infer(JsonArray arr, string key)
    {
        bool anyString = false, anyBool = false, anyFrac = false, anyInt = false, anyBig = false, anyValue = false;
        foreach (var item in arr)
        {
            if (item is not JsonObject o) continue;
            var v = o[key];
            if (v is not JsonValue jv) continue;
            anyValue = true;
            var kind = jv.GetValueKind();
            if (kind == JsonValueKind.String) anyString = true;
            else if (kind == JsonValueKind.True || kind == JsonValueKind.False) anyBool = true;
            else if (kind == JsonValueKind.Number)
            {
                var raw = jv.ToJsonString();
                if (raw.Contains('.') || raw.Contains('e') || raw.Contains('E')) anyFrac = true;
                else { anyInt = true; if (raw.Length > 9) anyBig = true; }
            }
        }
        if (!anyValue) return typeof(string);
        if (anyString) return typeof(string);
        if (anyFrac) return typeof(decimal);
        if (anyInt) return anyBig ? typeof(long) : typeof(int);
        if (anyBool) return typeof(bool);
        return typeof(string);
    }

    static object ToValue(JsonNode v, Type type)
    {
        if (type == typeof(string)) return v.ToString();
        if (type == typeof(int)) return (int)Math.Round(v.GetValue<decimal>());
        if (type == typeof(long)) return (long)Math.Round(v.GetValue<decimal>());
        if (type == typeof(decimal)) return v.GetValue<decimal>();
        if (type == typeof(bool)) return v.GetValue<bool>();
        return v.ToString();
    }

    // ---------- удобные обёртки для отдельных значений ----------
    public static decimal Dec(JsonNode? n) => n == null ? 0m : n.GetValue<decimal>();
    public static int Int(JsonNode? n) => n == null ? 0 : (int)Math.Round(n.GetValue<decimal>());

    /// <summary>Дата из графика: "2026-11-23 13:00:00", "2026-11-23", "2026-11", "2026".</summary>
    public static DateTime Date(string s)
    {
        string[] formats =
        {
            "yyyy-MM-dd HH:mm:ss", "yyyy-MM-ddTHH:mm:ss", "yyyy-MM-dd", "yyyy-MM", "yyyy",
            "yyyy-MM-dd HH:mm", "yyyy-MM-ddTHH:mm"
        };
        if (DateTime.TryParseExact(s, formats, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var d)) return d;
        return DateTime.TryParse(s, out var p) ? p : DateTime.MinValue;
    }
}
