# Social Suite

`sahne` · `siraya` · `threadly` birleşimi. Tek yetkili kaynak:
[`../BIRLESIM_PLANI.md`](../BIRLESIM_PLANI.md).

## Kurulum

```bash
npm install
```

`package-lock.json` **repoda** — normal kurulum ve `npm ci` bunu kullanır,
ek bayrak gerekmez.

### ⚠ Lockfile'ı sıfırdan üretmek gerekirse

`package-lock.json` silinip yeniden üretilecekse `--legacy-peer-deps` **şart**:

```bash
npm install --legacy-peer-deps
```

**Sebep.** `vitest`'in opsiyonel peer bağımlılıkları (`@vitest/ui`,
`webdriverio`, `canvas`…) npm 10.9.2'nin arborist'inde bir hatayı tetikliyor.
Bayrak olmadan kurulum şu hatayla düşer:

```
npm error Cannot read properties of null (reading 'edgesOut')
  at #loadPeerSet (build-ideal-tree.js:1289)
```

Bu bir bağımlılık çakışması değil, arborist'in opsiyonel peer setini çözerken
düştüğü bir hata — bayrak yalnızca o kod yolunu atlatıyor, sürüm çözümünü
gevşetmiyor. **Lockfile bir kez oluştuktan sonra** düz `npm install` ve
`npm ci` bayraksız çalışır; bu yüzden lockfile repoda tutuluyor.

### Node sürümü

`next@16.3.3`, Node `^22.22.2 || ^24.15.0 || >=26.0.0` istiyor. Aradaki
sürümlerde (ör. v23.x) `npm` EBADENGINE uyarısı verir; build/tsc/lint çalışır
ama CI ve Vercel Node sürümü bu aralığa sabitlenmelidir.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (tek sefer) |
| `npm run test:watch` | Vitest (izleme) |
| `npm run test:coverage` | Vitest + v8 kapsam raporu |
