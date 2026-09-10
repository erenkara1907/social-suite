/**
 * ⚠⚠⚠ GEÇİCİ TEŞHİS ROTASI (§12 adım 16 FAZ B1) — kalıcı DEĞİL.
 *
 * Amaç: `/api/instagram/callback`'in redirect_uri'si bu debug sürecinde
 * onlarca başarısız/geçersiz kod denemesi gördü — Meta'nın kötüye kullanım
 * sistemi `app_id + redirect_uri` çiftini işaretlemiş olabilir. Bu, HİÇ
 * kullanılmamış, temiz bir redirect_uri — aynı `GET`'i (`../callback/
 * route.ts`) birebir kullanıyor, mantık TEKRARLANMIYOR.
 *
 * Kök neden bulunduktan sonra bu dosya ve Meta panelindeki kayıt SİLİNECEK.
 */
export { GET } from "../callback/route";
