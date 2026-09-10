# Social Suite

`sahne` · `siraya` · `threadly` birleşimi. Tek yetkili kaynak:
[`docs/BIRLESIM_PLANI.md`](docs/BIRLESIM_PLANI.md).

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

**Sabitlenen sürüm: Node 24.** İki yerde yazılı:

| Yer | Değer | Ne yapar |
|---|---|---|
| `package.json` → `engines.node` | `>=24.15.0 <25` | `npm` uyumsuz sürümde EBADENGINE uyarır |
| `.nvmrc` | `24.15.0` | `nvm use` / `fnm use` doğru sürüme geçer |

`next@16.3.3` `^22.22.2 || ^24.15.0 || >=26.0.0` kabul ediyor; başlangıçta 22'ye
sabitlenmişti (ADIM_27 B2) — o seçim rastgeleydi, ikisi de eşit derecede
geçerliydi. §12 adım 16 FAZ B1'de Node 22 ↔ 24 arasında gerçek, gözlemlenmiş
bir `fetch`/`undici` davranış farkı bulundu: Instagram OAuth kod değişimi
Node 22'de (Vercel) sistematik olarak başarısız oluyordu, kaynak proje
siraya'nın (Vercel'in varsayılanı — Node 24) AYNI kodu sorunsuz çalıştırdığı
kanıtlandı. 24'e geçiş bu yüzden — kanıtlanmış bir üretim hatasını kapatıyor,
keyfi bir tercih değil (bkz. `docs/ADIM_16_17b_RAPOR.md`).

#### ⚠ `engines` tek başına Vercel'i BAĞLAMAZ

Vercel, Node sürümünü **proje ayarından** okur (Settings → General → Node.js
Version), `package.json`'ın `engines` alanından değil. `engines` orada yalnızca
bir doğrulama katmanı: proje ayarı `engines` aralığıyla çelişirse build hata
verir, ama ayarın kendisini değiştirmez.

**Yapılacak:** Vercel projesinde Node.js Version → **24.x** seçilmeli. CI
(GitHub Actions vb.) tarafında `actions/setup-node` zaten `.nvmrc`'yi
`node-version-file` ile okuyabilir.

#### Yerel durum

Bu makine şu an **v23.10.0** çalıştırıyor — aralığın dışında (önceki 22
aralığında da öyleydi). `npm install` EBADENGINE uyarısı verir; `build` /
`tsc` / `lint` / `test` dördü de çalışır. Kalıcı çözüm `nvm install 24.15.0`.

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
