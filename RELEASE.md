# ADLR — Release build útmutató

## App adatok
- **App neve:** ADLR
- **Package (applicationId):** `com.adlr.app`
- **Jelenlegi verzió:** versionCode `1`, versionName `1.0`
  (fájl: `android/app/build.gradle`)

## Aláíró kulcs (KRITIKUS — biztonságos helyre menteni!)
- Keystore: `android/upload-keystore.jks`
- Jelszavak: `android/keystore.properties` (gitignore-olva, nem kerül verziókövetésbe)
- Ha ez a fájl + jelszó elveszik, **az app nem frissíthető** ugyanazzal a kulccsal.
  Mentsd el a `.jks` fájlt és a jelszót külön, biztonságos helyre (jelszókezelő + felhő/pendrive).

## Környezet
Ezen a gépen a rendszer JDK túl új (JDK 25) a Gradle-höz, ezért egy külön JDK 21 kell.
Állítsd be a build előtt (PowerShell):

```powershell
$env:JAVA_HOME = "<JDK 21 útvonal>"        # pl. egy Temurin 21 kicsomagolva
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:ProgramFiles\nodejs;" + $env:Path
```

## Új release build lépései
Minden verziónál növeld a `versionCode`-ot (és jellemzően a `versionName`-t is) az
`android/app/build.gradle`-ben, majd:

```powershell
# projekt gyökér
npm run build
npx cap sync android
cd android
.\gradlew.bat bundleRelease
```

Kimenet (ezt töltsd fel a Play Console-ba):
`android/app/build/outputs/bundle/release/app-release.aab`

APK-t (pl. teszteléshez telefonra) így kapsz:
`.\gradlew.bat assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`
