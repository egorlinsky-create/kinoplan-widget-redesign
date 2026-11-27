import fs from 'node:fs';

const url = process.argv[2];
const file = process.argv[3];
const buf = fs.readFileSync(file);
const fd = new FormData();
fd.append('file', new Blob([buf], { type: 'image/png' }), 'qr-success.png');

const res = await fetch(url, { method: 'POST', body: fd });
const text = await res.text();
console.log(res.status, text.slice(0, 400));
