# `public/demo/` — demo varlıkları

Bu dizindeki dosyalar **yalnızca `APP_MODE=demo` için**. Hiçbiri üretimde
kullanılmaz, hiçbiri gerçek bir müşteri çıktısı değildir.

| Yol | Neyi temsil ediyor | Nasıl üretildi |
|---|---|---|
| `generated/placeholder-1024.png` | `ImagePort`/`StoragePort` demo çıktısı (AI ile üretilmiş görsel) | `sharp` ile SVG'den rasterize edilen jenerik degrade + ikon |
| `personas/mira-01.png` | Persona "Mira" görseli | Aynı yöntem — soyut baş/gövde şekli, marka yok |
| `personas/kerem-01.png` | Persona "Kerem" görseli | Aynı yöntem |
| `ugc/v60-demleme.jpg` | UGC videosunun demo çıktısı | **Video DEĞİL** — bkz. BİRLEŞİM PLANI §11 S5. Statik 9:16 poster + oynat ikonu + "DEMO ÇIKTI" rozeti |
| `voice/aeropress-ada.mp3` | Sentezlenen seslendirme çıktısı | `ffmpeg anullsrc` ile üretilmiş 3 saniyelik sessiz mp3 — dalga formu bileşeni render eder, çalınca ses çıkmaz |
| `uploads/cold-brew-raf.jpg` | Kullanıcının elle yüklediği fotoğraf | Aynı `sharp`/SVG yöntemi, jenerik "yüklenen görsel" etiketiyle |

## Neden stok görsel/video yok

Üç kaynak projenin (`sahne`, `siraya`, `threadly`) hiçbir varlığı buraya
kopyalanmadı. `sahne/videos/*.mp4` GoatStarter'ın kendi tanıtım videolarıydı,
UGC örneği değildi — kopyalansaydı stüdyonun ne ürettiğini yanlış anlatırdı
(§11 S5). Tüm görseller programatik üretildi (`sharp` + SVG); telifi belirsiz
hiçbir dosya yok.

## Markasız kural

Hiçbir dosya `sahne`/`siraya`/`threadly` filigranı taşımıyor
(`ADIM_012_RAPOR.md`'nin S5 bulgusu). Etiketler jenerik: "ÜRETİLEN GÖRSEL",
"PERSONA · <isim>", "DEMO ÇIKTI", "YÜKLENEN GÖRSEL".

## Ne zaman değişir

**Adım 20**'de (`LIVE #4 — UGC boru hattı`) bu dosyaların yerini gerçek
Kie/ElevenLabs/fal çıktıları alacak; bu dizin FAZ 1 demosunun ötesinde
kullanılmayacak.
