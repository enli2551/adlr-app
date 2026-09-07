# ADLR — iOS build útmutató (Mac nélkül, felhőből)

Az ADLR **Capacitor**-app, így iOS-en is fut. iOS-buildet **macOS + Xcode** tud gyártani —
de **nem kell saját Mac**: egy felhős macOS-CI (itt **Codemagic**) elkészíti a `.ipa`-t.

> Fontos: **NE** Expo/EAS — az React Native-hez való, az ADLR Capacitor. EAS = teljes újraírás.

## Előfeltétel
- **Apple Developer Program tagság — $99/év** (developer.apple.com). Ez kell a signinghez,
  TestFlighthez és az App Store-hoz. Enélkül nincs iOS-terjesztés.
- Egy git-remote (GitHub/GitLab/Bitbucket), amit a Codemagic elér.

## Egyszeri beállítás (Codemagic UI — codemagic.io)
1. Regisztrálj, **kösd be ezt a repót**.
2. **Teams → Integrations → App Store Connect**: adj hozzá egy **App Store Connect API kulcsot**
   (App Store Connect → Users and Access → Integrations → API keys). Nevezd el: `ADLR_ASC`
   (a `codemagic.yaml` erre hivatkozik).
3. A `com.adlr.app` **bundle id**-t a Codemagic az automatikus signinggal létre tudja hozni
   (a `fetch-signing-files ... --create` lépés), vagy előre regisztrálhatod az Apple fiókban.
4. Az App Store Connectben hozd létre az **ADLR app rekordot** (ugyanazzal a bundle id-val).

## Build
- A `codemagic.yaml` már a repóban van (`ios-release` workflow).
- Indíts egy buildet a Codemagicban (push vagy manuális). A felhős Mac:
  `npm ci` → `vite build` → `cap sync ios` → automatikus signing → `.ipa` → **TestFlight**.
- A TestFlightből a tesztelők (és te) telepíthetitek; App Store-hoz onnan indítod a review-t.

## Fejlesztői ciklus (te, Windowson)
- Kódolsz PC-n → `npm run build` → `npx cap sync ios` (a webes változásokat átmásolja).
- Push → Codemagic újrabuildel. **Xcode nem kell hozzád.**
- Ha natív iOS-módosítás kell (Info.plist, új natív plugin), azt is Windowson szerkeszted;
  a felhős Mac fordítja.

## iOS-specifikus tudnivalók / eltérések az Androidtól
- **Működik iOS-en:** a teljes webes app (React UI), haptics, **local notifications**
  (pihenő-vég értesítés + **session-emlékeztetők**), téma-rendszer, sablonok, Monatsbericht,
  edzés-historie — mind cross-platform.
- **Élő pihenő-countdown (RestChrono):** ez **Android-only natív plugin** (Java, chronométer-
  értesítés). iOS-en nincs natív megfelelője standard értesítéssel — a JS wrapper **csendben
  no-op**-ol (nem hibázik), és a pihenő az **in-app időzítővel + ütemezett „Pause vorbei"
  értesítéssel** működik. A live lock-screen ketyegéshez iOS-en **Live Activity** (ActivityKit)
  kellene — külön, nagyobb feladat, ha később kell.
- **Push-értesítés:** csak *local* notification van (nincs szerveres push) — ez iOS-en is jó.

## Alternatíva (ha nem Codemagic)
- **Ionic Appflow** (a Capacitor-csapattól) vagy **GitHub Actions** `macos-latest` runner
  (`npm ci` → `vite build` → `cap sync ios` → `xcodebuild -project ios/App/App.xcodeproj
  -scheme App ... archive` + export). Mindegyik felhős Mac, ugyanaz a végeredmény.
