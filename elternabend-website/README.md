# Elternabend-Bestellportal

Eine responsive Bestellseite für Lehrer plus geschütztes Admin-Dashboard. Gedacht für GitHub Pages (Frontend) und Supabase (Datenbank/Auth).

## Enthalten

- Lehrer-Bestellseite ohne Konto
- Produkte nach Kategorien und Mengenwahl
- Bestellabschluss mit Name und optionaler Anmerkung
- Preise werden serverseitig aus Supabase übernommen
- Admin-Login, Bestellübersicht, Summen, CSV-Export
- Produkte, Kategorien, Preise und Sichtbarkeit verwalten
- Veranstaltungstermin bearbeiten und `.ics`-Kalendereintrag mit 1-Stunden-Erinnerung herunterladen

## 1. Supabase einrichten

1. Unter https://supabase.com ein kostenloses Projekt erstellen.
2. Im SQL Editor den gesamten Inhalt von `supabase/schema.sql` ausführen.
3. Unter **Project Settings → API** die Project URL und den `anon` / `publishable` public key kopieren.
4. Diese Werte in `config.js` einsetzen.
5. Unter **Authentication → Users** einen Benutzer für den Adminbereich anlegen. Öffentliche Registrierung muss nicht aktiviert werden.

Wichtig: Nur den öffentlichen `anon`/`publishable` Key in `config.js` eintragen. Niemals den `service_role` Key veröffentlichen.

## 2. Lokal testen

Die Dateien über einen lokalen Webserver öffnen (nicht per Doppelklick auf `index.html`), z. B. mit der VS-Code-Erweiterung Live Server.

## 3. Auf GitHub Pages veröffentlichen

1. Ein neues GitHub-Repository erstellen.
2. Alle Dateien und den Ordner `supabase` hochladen.
3. In GitHub unter **Settings → Pages** als Quelle `Deploy from a branch`, Branch `main`, Ordner `/ (root)` auswählen.
4. Nach dem Deployment die angezeigte GitHub-Pages-Adresse öffnen.

`config.js` muss vor dem Veröffentlichen mit den eigenen Supabase-Werten ausgefüllt sein.

## Kalenderhinweis

Im Adminbereich kann ein `.ics`-Termin erzeugt werden. Er enthält eine lokale Kalendererinnerung eine Stunde vor Veranstaltungsbeginn. Die Erinnerung wird erst aktiv, nachdem du die Datei in deinen Kalender importiert bzw. geöffnet und gespeichert hast. Eine automatische E-Mail oder Push-Erinnerung durch die Website selbst ist in dieser ersten Version nicht enthalten.

## Datenschutz / Schulbetrieb

Vor dem echten Einsatz mit der Schulleitung bzw. dem Datenschutzbeauftragten abstimmen. Namen und Bestelldaten sind personenbezogene Daten. Lege fest, wer Admin-Zugriff hat, wie lange Bestellungen gespeichert werden und wann sie gelöscht werden. Verwende keine sensiblen Angaben im Notizfeld. Die Seite sollte nur mit schulischer Freigabe und passender Datenschutzerklärung eingesetzt werden.

## Vor dem Livegang prüfen

- [ ] Supabase-Projekt erstellt und SQL ausgeführt
- [ ] `config.js` befüllt
- [ ] Admin-Konto erstellt
- [ ] Testbestellung mit Testnamen durchgeführt
- [ ] Adminansicht und CSV-Export geprüft
- [ ] Veranstaltungstermin gesetzt und ICS-Datei getestet
- [ ] Datenschutzfreigabe / Datenschutzhinweise geklärt
