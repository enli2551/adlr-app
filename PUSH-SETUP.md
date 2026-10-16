# Push-értesítések — beállítás (Android FCM + iOS APNs)

Mit kap a felhasználó (zárt appnál is):

| Esemény | Kinek | Szöveg (DE/EN/HU a címzett `profiles.lang` szerint) | Koppintás → |
|---|---|---|---|
| Új chat-üzenet az edzőtől | kliens | cím: edző neve, szöveg: rövid előnézet (max ~90 karakter) | `/app/coach` |
| Edző válaszolt a check-inre | kliens | „{coach} hat auf deinen Check-in geantwortet" + előnézet | `/app` |
| Új chat-üzenet a klienstől | edző | cím: kliens neve, szöveg: előnézet | `/trainer/nachrichten?client=…` (rögtön a szál) |
| Új heti check-in | edző | „Neuer Check-in — {név} hat den Wochen-Check-in ausgefüllt." | `/trainer/klienten?client=…` |
| Új / áthelyezett / lemondott jövőbeli Termin | a másik fél (általában a kliens) | „Neuer Termin / Termin verschoben / Termin abgesagt" + dátum, idő, helyszín | `/app` ill. edzőnél Kalender |

Az engedélyt az app **bejelentkezés után, az app belsejében** kéri egyszer (nem a login-képernyőn, nem
onboarding közben). Ha már megvan (pl. a pihenő-időzítő miatt), csendben regisztrál. Kijelentkezéskor
a készülék tokenje törlődik; fióktörléskor is (`delete-account`).

**Architektúra:** DB-trigger (`messages`, `sessions`; a check-in és a válasz mindig chat-üzenettel jár, így azt is a `messages` fedi) → `pg_net` → Edge Function
`send-push` → Androidra FCM HTTP v1, iOS-re **közvetlenül APNs** (.p8 kulccsal). Az iOS-appba
**nem kell Firebase SDK és GoogleService-Info.plist** — a `@capacitor/push-notifications` iOS-en a
nyers APNs-tokent adja, azt a függvény egyenesen az Apple-nek küldi. (Ez a „Database Webhook" saját,
kódban verziózott változata — a Dashboardon NEM kell webhookot felvenni.)

Amíg valamelyik lépés hiányzik, **semmi nem törik**: a triggerek csendben nem csinálnak semmit,
Androidon `google-services.json` nélkül az app nem is próbál regisztrálni.

---

## 1. Firebase-projekt (Android)
1. https://console.firebase.google.com → **Add project** → név pl. `ADLR` (Google Analytics: **kikapcsolva**, nem kell).
2. Projekt-áttekintő → **Android** ikon → package name: `com.adlr.app` → Register app.
3. Töltsd le a **`google-services.json`**-t → másold ide: `project/android/app/google-services.json`.
   - A Gradle csak akkor kapcsolja be a google-services plugint, ha ez a fájl létezik (`android/app/build.gradle` alja).
   - Tiszta build-worktree-be (pl. `D:/code/adlr/build-1.0.30`) **ezt is át kell másolni**, mint a keystore-t — különben az a build push nélkül készül (nem crashel, csak nincs push).
   - A „Add Firebase SDK" lépéseket a konzolban **hagyd ki** — a Capacitor plugin már tartalmazza.
4. iOS-appot a Firebase-ben **nem kell** felvenni.

## 2. Service account → Supabase secret (Android küldéshez)
1. Firebase konzol → ⚙️ Project settings → **Service accounts** → **Generate new private key** → JSON letöltődik.
2. Supabase Dashboard → Edge Functions → **Secrets** → új secret:
   - `FCM_SERVICE_ACCOUNT` = a JSON fájl **teljes tartalma** (egy az egyben bemásolva).
3. A JSON-t ne tedd a repóba.

## 3. APNs kulcs (iOS)
1. https://developer.apple.com/account → Certificates, Identifiers & Profiles → **Keys** → ➕
   → név pl. `ADLR Push` → pipáld: **Apple Push Notifications service (APNs)** → Continue → Register.
2. Töltsd le az **`AuthKey_XXXXXXXXXX.p8`**-at (csak egyszer lehet!) és jegyezd fel a **Key ID**-t.
3. Supabase → Edge Functions → Secrets:
   - `APNS_KEY_P8` = a .p8 fájl teljes szövege (`-----BEGIN PRIVATE KEY-----` … `-----END PRIVATE KEY-----`)
   - `APNS_KEY_ID` = a 10 karakteres Key ID
   - `APNS_TEAM_ID` = `7S87RYSQ7D`
   - (`APNS_SANDBOX` — NE állítsd be; TestFlight és App Store = production. Csak Xcode-ból futtatott debug buildhez kellene `1`.)

## 4. App ID + provisioning profil (iOS, egyszer)
1. Apple Developer → **Identifiers** → `com.adlr.app` → pipáld: **Push Notifications** → Save.
   (A widget, `com.adlr.app.RestTimerWidget`, NEM kell.)
2. Apple Developer → **Profiles** → a `com.adlr.app` **App Store** profil(ok) → **Delete**.
   Ok: a régi profilban nincs push-jogosultság, az `App.entitlements` viszont már kéri (`aps-environment = production`) → aláírási hiba lenne.
   A következő Codemagic `ios-release` a `fetch-signing-files --create`-tel új, push-os profilt gyárt.
3. Ha a Codemagic mégis „entitlement … not included in profile" hibát ad: ellenőrizd, hogy az 1–2. lépés megtörtént, és indítsd újra.

## 5. Webhook-titok (közös a DB és a függvény között)
1. Generálj egy véletlen stringet (pl. https://www.random.org/strings vagy jelszókezelő, 32+ karakter).
2. Supabase → Edge Functions → Secrets: `PUSH_WEBHOOK_SECRET` = ez a string.
3. Ugyanezt a Vaultba (SQL Editor):
   ```sql
   select vault.create_secret('https://gzcewdhjlykwqhtjludv.supabase.co/functions/v1/send-push', 'push_function_url');
   select vault.create_secret('IDE-A-STRING', 'push_webhook_secret');
   ```
   (Változtatás később: `select vault.update_secret((select id from vault.secrets where name='push_webhook_secret'), 'ÚJ');`)

## 6. Migráció
SQL Editor → futtasd: `supabase/migrations/20261017_push.sql`
(létrehozza: `push_tokens` + RLS, `register_push_token` RPC, `pg_net` extension, triggerek).
Az 5. lépés előtt is futtatható — titok nélkül a triggerek nem küldenek.

## 7. Edge Functions
1. **`send-push`** deploy: Dashboard → Edge Functions → Deploy new function → név `send-push`,
   tartalom: `supabase/functions/send-push/index.ts`. **Verify JWT: KI** (a hívó az adatbázis, a
   `x-push-secret` fejléc hitelesít).
   CLI-vel: `npx supabase functions deploy send-push --no-verify-jwt`
2. **`delete-account`** redeploy (most a push-tokeneket is törli): `supabase/functions/delete-account/index.ts`, Verify JWT marad BE.

## 8. Build
- Android: `google-services.json` a helyén → szokásos `npm run build` → `npx cap sync` → bundleRelease.
- iOS: Codemagic `ios-release` (a `cap sync ios` a workflowban van; a 4. lépés kell előtte).
- Az engedélyt kérő szöveg iOS-en a rendszeré (nem kell Info.plist kulcs). Háttér-módot
  (`remote-notification`) nem kértünk, mert csak látható értesítést küldünk, néma pusht nem.

## 9. Teszt (készüléken)
1. Telefonon jelentkezz be kliensként → ~2,5 mp múlva engedély-kérés → Engedélyezés.
2. SQL Editor: `select user_id, platform, updated_at from push_tokens;` → ott a sor.
3. **Zárd be / tedd háttérbe** az appot (előtérben szándékosan nincs rendszer-értesítés, ott az in-app banner szól).
4. Edzőként (másik készülék vagy web) írj a kliensnek → értesítés jön → koppintás → Coach-fül.
5. Ha nem jön: Supabase → Edge Functions → `send-push` → **Logs** (FCM/APNs hibaüzenet ott látszik),
   illetve `select * from net._http_response order by created desc limit 5;` (a trigger hívásai).

---

## Datenschutzerklärung — beillesztendő szakasz (DE)

> **Push-Benachrichtigungen**
>
> Wenn du Benachrichtigungen erlaubst, informiert dich die App über neue Nachrichten deines Coaches
> bzw. deiner Klient:innen, Antworten auf Check-ins sowie neue, verschobene oder abgesagte Termine.
> Dazu speichern wir ein gerätebezogenes Push-Token zusammen mit deiner Nutzer-ID und dem
> Betriebssystem (Android/iOS). Für die Zustellung übermitteln wir das Token und den
> Benachrichtigungstext (Titel, z. B. Name des Absenders, und eine kurze Vorschau der Nachricht bzw.
> Datum/Uhrzeit/Ort des Termins) an den Push-Dienst deines Betriebssystems:
>
> - **Android:** Firebase Cloud Messaging (FCM) der Google Ireland Limited, Gordon House, Barrow
>   Street, Dublin 4, Irland. Dabei kann eine Übermittlung an Google LLC in die USA nicht
>   ausgeschlossen werden; Google ist unter dem EU-US Data Privacy Framework zertifiziert.
>   Datenschutzhinweise: https://firebase.google.com/support/privacy
> - **iOS:** Apple Push Notification service (APNs) der Apple Distribution International Ltd.,
>   Hollyhill Industrial Estate, Hollyhill, Cork, Irland (Apple Inc., USA, ist unter dem EU-US Data
>   Privacy Framework zertifiziert). Datenschutzhinweise: https://www.apple.com/legal/privacy/
>
> Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du jederzeit in den
> Systemeinstellungen deines Geräts widerrufen kannst. Das Token wird beim Abmelden und beim
> Löschen deines Kontos gelöscht sowie entfernt, sobald der Push-Dienst es als ungültig meldet.
> Wir verwenden keine Firebase-Analyse- oder Tracking-Funktionen.

App Store Connect → App Privacy: nincs új adattípus-kategória (Device ID-ként a push token nem
számít „tracking"-nek; ha a kérdőív rákérdez: *Identifiers → Device ID → App Functionality, linked, no tracking*).
Google Play → Datensicherheit: *Geräte- oder andere IDs* → erfasst, App-Funktionen, nicht geteilt
(a push-szolgáltató adatfeldolgozó, nem „sharing").
