#!/usr/bin/env node
// Генерирует server/src/i18n.json из Desktop-файла Localization.cs.
// Так тексты интерфейса веб-версии и приложения гарантированно совпадают.
//
// Запуск:  node tools/gen-i18n.js
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'Localization.cs'), 'utf8');
const start = src.indexOf('static readonly Dictionary<string, string[]> D');
if (start < 0) throw new Error('Не найден словарь D в Localization.cs');
const body = src.slice(start);

const entry = /\["((?:[^"\\]|\\.)*)"\]\s*=\s*X\(([\s\S]*?)\)\s*,?\s*\n/g;
const literal = /"((?:[^"\\]|\\.)*)"/g;

function unescapeCs(t) {
  return t.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e) => {
    if (e[0] === 'u') return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', "'": "'" }[e] ?? e;
  });
}

const dict = {};
let m;
while ((m = entry.exec(body))) {
  const key = unescapeCs(m[1]);
  const values = [...m[2].matchAll(literal)].map(x => unescapeCs(x[1]));
  if (values.length !== 3) {
    console.warn(`  пропущен ключ ${key}: ожидалось 3 языка, найдено ${values.length}`);
    continue;
  }
  dict[key] = values;
}

const out = path.join(root, 'server', 'src', 'i18n.json');
fs.writeFileSync(out, JSON.stringify(dict, null, 0) + '\n', 'utf8');
console.log(`Готово: ${Object.keys(dict).length} ключей → ${path.relative(root, out)}`);
