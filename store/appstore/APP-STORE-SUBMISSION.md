# ADLR – App Store beküldés (iOS)

Minden, ami az App Store Connectben kell. A szövegek **németül** vannak (fő piac); a magyarázat magyarul.
Ha később angol vagy magyar áruházi nyelvet is felveszel, a szövegeket lefordítom.

Sorrend: **1.** build (Codemagic `ios-release`, 1.0.29, már csak iPhone) → **2.** App Information → **3.** App Privacy → **4.** verzió-oldal (képek, szövegek, build, App Review) → **5.** Submit for Review.

---

## 1. Képernyőképek

Mappa: `store/appstore/screenshots/` — 8 kép, mind **1320 × 2868** (iPhone 6,9", ez az egyetlen kötelező méret; a kisebb iPhone-okra az Apple automatikusan lekicsinyíti).

| # | Fájl | Felirat |
|---|---|---|
| 1 | 01-client-plan.png | Dein Plan. Von deinem Coach. |
| 2 | 02-client-training.png | Satz für Satz tracken |
| 3 | 03-client-demo.png | Über 300 Übungen animiert |
| 4 | 04-client-progress.png | Fortschritt, der motiviert |
| 5 | 05-client-coach.png | Dein Coach ist immer dabei |
| 6 | 06-client-nutrition.png | Ernährung im Blick |
| 7 | 07-trainer-client.png | Für Personal Trainer |
| 8 | 08-trainer-builder.png | Pläne in Minuten – mit KI |

Feltöltés: verzió-oldal → **iPhone 6.9" Display** → húzd be a 8 képet ebben a sorrendben. (A `raw/` almappa a felirat nélküli nyers képeket tartalmazza, azok nem kellenek.)
A képek tesztadatokkal készültek (kitalált „Lukas Berger” sportoló), valódi ügyféladat nincs rajtuk.

---

## 2. App Information (egyszer kell kitölteni)

| Mező | Érték |
|---|---|
| **Name** (max. 30) | `ADLR – Personal Training` |
| **Subtitle** (max. 30) | `Training mit deinem Coach` |
| **Primary Category** | Health & Fitness |
| **Secondary Category** | Lifestyle (opcionális) |
| **Content Rights** | „Does not contain, show, or access third-party content" → a gyakorlat-animációk licencelt saját tartalmak (Vital Animations, kereskedelmi licenc), ezért ez rendben van |
| **Age Rating** | a kérdőívben minden „None" / „No" → **4+**. (Nincs erőszak, szerencsejáték, felnőtt tartalom; a chat csak az edző és a sportoló között van, nem nyilvános → „Unrestricted Web Access: No", „User-Generated Content": No) |

---

## 3. Verzió-oldal szövegei

### Promotional Text (max. 170 — bármikor módosítható beküldés nélkül)
```
Neu: über 300 animierte Übungen, Mobilität & Dehnen und flexible Workouts. Trainiere mit Plan – Satz für Satz, begleitet von deinem Coach.
```

### Description (max. 4000)
```
ADLR – Steig auf. Bleib stark.

ADLR verbindet dich direkt mit deinem Personal Trainer. Dein Coach erstellt deinen Trainingsplan, du trainierst Satz für Satz in der App – und ihr beide seht jederzeit, wie du vorankommst. Kein anonymer Feed, keine austauschbaren Pläne: echtes, begleitetes Coaching.

Der Name steht für vier Prinzipien:
A – Ausdauer: dranbleiben, wenn andere aufgeben.
D – Disziplin: Gewohnheiten, die dich jeden Tag stärker machen.
L – Longevity: fit sein – ein Leben lang.
R – Repeat: Wiederholung schlägt Perfektion.

TRAINIEREN MIT PLAN
• Dein persönlicher Wochenplan – von deinem Coach erstellt, direkt in der App
• Jeden Satz tracken: Gewicht, Wiederholungen, Aufwärm- und Drop-Sätze
• Pausentimer mit Countdown auf dem Sperrbildschirm
• Über 550 Übungen, mehr als 300 davon mit Animation und Technik-Hinweisen
• Mobilität, Dehnen und Aufwärmen als eigene Kategorie
• Freies Training: stell dir dein Workout selbst zusammen
• Persönliche Rekorde werden automatisch erkannt
• Funktioniert auch offline – deine Einheit wird gespeichert, sobald du wieder online bist

FORTSCHRITT, DER MOTIVIERT
• Kraftkurven und Rekorde pro Übung
• Trainingsverlauf und Kalender mit allen Sätzen
• Wochenrückblick und Monatsbericht
• Gewicht, Maße und Fortschrittsfotos
• Monatliche Challenge und Wochen-Serien

ERNÄHRUNG IM BLICK
• Kalorien- und Proteinziel passend zu deinem Ziel
• Wasser-Tracker und Tipps von deinem Coach
• Optional mit Apple Health: Schritte, Schlaf, Gewicht, Ruhepuls und gegessene Kalorien (z. B. aus YAZIO) – nur lesend

DEIN COACH – IMMER DABEI
• Direkter Chat mit deinem Trainer
• Termine und Erinnerungen für eure Sessions
• Wöchentlicher Check-in, damit dein Plan zu dir passt

UMSTEIGEN LEICHT GEMACHT
• Importiere deine bisherigen Trainings aus Hevy oder Strong – deine Kraftkurven laufen nahtlos weiter

FÜR PERSONAL TRAINER
ADLR ist auch dein Arbeitswerkzeug: Klienten verwalten, Trainingspläne im Plan-Builder bauen – auf Wunsch mit KI-Vorschlag –, Vorlagen wiederverwenden, Fortschritt und Trainingstreue deiner Klienten verfolgen, Sessions planen, per Chat betreuen und Pakete sowie Zahlungen im Blick behalten.

ADLR ist auf Deutsch, Englisch und Ungarisch verfügbar.

Hinweis: ADLR ersetzt keine medizinische Beratung. Sprich vor einem neuen Trainingsprogramm mit einem Arzt, wenn du gesundheitliche Beschwerden hast.

Steig auf. Bleib stark.
```

### Keywords (max. 100, vesszővel, szóköz nélkül — a név és az alcím szavait nem kell ismételni)
```
Krafttraining,Trainingsplan,Workout,Gym,Fitness,Übungen,Ernährung,Muskelaufbau,Abnehmen,Hanteln
```

### What's New in This Version
```
Erste Version im App Store. Über 300 animierte Übungen, Mobilität & Dehnen, Hevy- und Strong-Import und vieles mehr.
```

### URL-ek
| Mező | Érték |
|---|---|
| **Support URL** (kötelező) | a weboldalad vagy egy kapcsolat-oldal URL-je (pl. ahol a support e-mail szerepel) |
| **Marketing URL** | opcionális – a weboldalad, ha már él |
| **Privacy Policy URL** (App Privacy alatt, kötelező) | ugyanaz az adatvédelmi link, amit a Play Console-ban megadtál |

### Copyright
```
2026 ADLR
```
(vagy a cég / a te neved, ahogy a Play-ben szerepel)

---

## 4. App Privacy – kitöltés kérdésről kérdésre

App Store Connect → az app → **App Privacy** → Get Started.

**„Do you or your third-party partners collect data from this app?"** → **Yes**

Jelöld be ezeket az adattípusokat:

| Kategória → adattípus | Miért gyűjti az app |
|---|---|
| Contact Info → **Name** | profil (keresztnév, vezetéknév) |
| Contact Info → **Email Address** | bejelentkezés |
| Contact Info → **Phone Number** | az opcionális bővített profilban megadható |
| Health & Fitness → **Health** | testsúly, mérések, ruhepuls, alvás, sérülések (onboarding), Apple Health-adatok |
| Health & Fitness → **Fitness** | edzések, szettek, lépések |
| User Content → **Photos or Videos** | fejlődési fotók, profilkép |
| User Content → **Other User Content** | chatüzenetek, heti check-in, jegyzetek |
| Identifiers → **User ID** | fiók-azonosító |
| Diagnostics → **Crash Data** | hibakövetés (Better Stack / Sentry SDK – csak hibák, nincs viselkedés-követés) |

**Mindegyik adattípusnál** a további kérdések:
- **Purpose:** csak **App Functionality** (ne jelölj Analytics / Advertising / Product Personalization célt)
- **Linked to the user's identity?** → **Yes** (mind a fiókhoz kötődik; a hibajelentések is a fiók-ID-hez)
- **Used for tracking?** → **No** (nincs reklám, nincs adatmegosztás adatbrókerekkel)

Amit **ne** jelölj: Location, Contacts, Browsing History, Search History, Purchases, Financial Info, Usage Data, Sensitive Info, Audio.

> Ha később bekerül a PostHog (analitika), akkor a **Usage Data → Product Interaction** típust fel kell venni „Analytics" céllal — szólj, és frissítem.

**Account deletion:** az Apple megköveteli, megvan: Profil → Einstellungen → Konto löschen (a `delete-account` szerverfunkció törli az adatokat és a fiókot).

---

## 5. App Review Information

### Sign-In Information (kötelező, mert az app bejelentkezést igényel)
Az Apple bírálója regisztráció után meghívókód és edzésterv nélkül szinte üres appot látna → **előre elkészített tesztfiókot** kell adni.

**Teendő (neked, mert jelszót én nem adhatok meg):**
1. Hozz létre egy új sportoló-fiókot az appban, pl. `appreview@<a te domained>` e-maillel és egy erős jelszóval.
   - Regisztrációnál add meg Péter meghívókódját, hogy hozzá legyen rendelve.
2. Péter rendeljen hozzá egy edzéstervet (pl. a Starter-Plant vagy egy rövid Push/Pull/Legs tervet).
3. Csinálj vele 1–2 edzést, és írj egy chatüzenetet Péter nevében, hogy a bíráló ne üres képernyőket lásson.
4. **Ne kapcsold be** neki az Apple Health-et és ne kapcsold be a tervszerkesztés-csúszkát (az alapállapotot lássa).
5. Az App Review Information alatt: **Sign-in required: Yes**, User name = az e-mail, Password = a jelszó.

Ha az edzői oldalt is látnia kell (ajánlott, mert a képeken is szerepel): hozz létre egy **teszt-edző** fiókot is (külön e-mail, edzői regisztráció), és a második fiók adatait a Notes-ba írd.

### Contact Information
Saját neved, telefonszámod, e-mail címed (csak az Apple látja).

### Notes (angolul – a bíráló ezt olvassa)
```
ADLR is a coaching app for personal trainers and their clients. Clients only see a training plan once their coach has assigned one, so please use the demo client account below – it is already linked to a coach and has a plan and some logged workouts.

Demo client: see Sign-In Information.
Demo trainer (optional, to review the coach side): <trainer email> / <password>

Health data: Apple Health is optional and read-only (steps, sleep, body weight, resting heart rate, dietary energy). It is used to show the client and their coach their progress. Nothing is written to Apple Health. To test it: Profil > Apple Health > Mit Apple Health verbinden.

Account deletion: Profil > Einstellungen > Konto löschen.

Exercise animations are licensed for commercial in-app use (Vital Animations).

Background audio (UIBackgroundModes "audio"): only during a running rest timer of an active workout. When the rest ends, the app plays an audible beep mixed into the user's music (so the music is not lowered, as a notification sound would do) — also with the phone locked. The audio session is released right after the beep; nothing plays between rests or after the workout. To test: start a workout, tick a set, lock the phone, wait for the rest to end.

The app UI language follows the device (German, English, Hungarian) and can be changed in Profil > Einstellungen > Sprache.
```

### Version Release
Ajánlott: **„Manually release this version"** – így jóváhagyás után te döntöd el, mikor élesedik.

---

## 6. Beküldés előtti ellenőrzőlista

- [ ] Codemagic `ios-release` build kész (1.0.29, csak iPhone) és megjelent az App Store Connectben (a TestFlight alatt „Ready to Submit")
- [ ] A verzió-oldalon kiválasztottad ezt a buildet (**Build** szekció → +)
- [ ] 8 képernyőkép feltöltve (iPhone 6.9")
- [ ] Promotional Text, Description, Keywords, Support URL, What's New kitöltve
- [ ] App Information: név, alcím, kategória, korhatár (4+)
- [ ] App Privacy kitöltve és **Published**
- [ ] Privacy Policy URL megadva
- [ ] Tesztfiók elkészítve (terv + 1–2 edzés), adatai az App Review Informationben
- [ ] Notes kitöltve
- [ ] Export Compliance: nem kérdez rá (az `ITSAppUsesNonExemptEncryption = false` be van állítva)
- [ ] Add for Review → Submit

Bírálat általában **24–48 óra**. Ha elutasítják, a pontos indoklás az App Store Connectben (Resolution Center) jelenik meg – küldd el, és megoldjuk.
