# Here are a few DevTools snippets to read localStorage JSON. Pick the one that matches what you need:

## If you know the key

```js
(() => {
  const key = "YOUR_KEY_HERE";
  const raw = localStorage.getItem(key);
  const json = raw ? JSON.parse(raw) : null;
  console.log(json);
  return json;
})();
```

## Dump all localStorage as an object (strings)

```js
(() => {
  const all = Object.fromEntries(Object.entries(localStorage));
  console.log(all);
  return all;
})();
```

## Dump and parse any JSON-looking values

```js
(() => {
  const parsed = Object.fromEntries(
    Object.entries(localStorage).map(([k, v]) => {
      try { return [k, JSON.parse(v)]; } catch { return [k, v]; }
    })
  );
  console.log(parsed);
  return parsed;
})();
```

## If you meant a specific key, tell me the key name and I’ll tailor it.

## Factory reset (clear all localStorage)

```js
(() => {
  localStorage.clear();
  return true;
})();
```

## Factory reset (clear all except a set of keys)

```js
(() => {
  const keep = new Set([
    // Example: add keys to keep
    // 'someKey',
  ]);

  for (const key of Object.keys(localStorage)) {
    if (!keep.has(key)) localStorage.removeItem(key);
  }
  return Object.fromEntries(Object.entries(localStorage));
})();
```

## Notes

- If you truly want a clean slate, clear everything (including legacy keys).
- Legacy keys (`spawnLog`, `moveLog`, `spawnLabel`, `bestScore`) are only used for migration and should be empty in a healthy state.
