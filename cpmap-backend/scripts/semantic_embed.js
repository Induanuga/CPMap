#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

(async () => {
  const rawInput = fs.readFileSync(0, 'utf8').trim();
  let payload = rawInput;

  try {
    payload = JSON.parse(rawInput);
  } catch (error) {
    payload = rawInput || '';
  }

  if (typeof payload === 'string') {
    payload = [payload];
  } else if (!Array.isArray(payload)) {
    payload = [String(payload)];
  }

  const { pipeline, env } = await import('@xenova/transformers');
  env.cacheDir = path.resolve(__dirname, '..', 'model_cache');

  const model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const embeddings = [];

  for (const text of payload) {
    const output = await model(text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data));
  }

  process.stdout.write(JSON.stringify(embeddings.length === 1 ? embeddings[0] : embeddings));
})().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
