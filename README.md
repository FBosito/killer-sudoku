# Killer Sudoku

Browserbasiertes Killer Sudoku zum Lösen mit dem Stift – wie auf Papier, optimiert fürs Tablet im Hochformat.

**Online spielen:** https://fbosito.github.io/killer-sudoku/

## Starten

`index.html` im Browser öffnen (Doppelklick genügt). Kein Server, kein Build, keine Abhängigkeiten –
der Ordner kann einfach auf einen anderen Rechner kopiert werden.

## Layout

Das Rätsel hat ringsum 3 cm beschreibbaren Rand für Notizen.
Im Hochformat geht das Blatt über die ganze Breite (Buttons oben, Session-Log unten),
im Querformat über die ganze Höhe (Buttons und Session-Log links daneben).

## Bedienung

- **Level 1–4** wählen (wird per Cookie gemerkt), **Neu generieren** erzeugt ein eindeutig lösbares Rätsel.
  Ein laufendes Spiel wird dabei verworfen und die Tinte gelöscht.
- **Start** gibt das Brett zum Schreiben frei und startet die Uhr.
- **Pause/Weiter** unterbricht kurz (Uhr steht, Brett gesperrt); beim Wechsel in einen anderen Tab pausiert die App automatisch.
- **Stop** markiert das Spiel als fertig.
- **Stift** schreibt mit schwarzer Tinte und fester Strichstärke (Scratchpad-Prinzip, keine Erkennung).
  Radiergummi-Ende oder gedrückte Seitentaste löscht überstrichene Striche. Finger/Handballen werden ignoriert.
- **Speichern** legt das Rätsel mit der eigenen Lösung, Level und Zeit als PNG-Bild ab.
- **Session-Protokoll**: Jeder Seitenaufruf startet eine neue Session. Ein Spiel gilt als *beendet*,
  wenn es nach **Stop** verlassen wird, sonst (laufend, pausiert, nie gestartet) als *verworfen*.
  „Log löschen“ leert die Liste.
- **Bestzeiten**: dauerhaft im Browser gespeichert; angezeigt werden die besten 5 beendeten Spiele des gewählten Levels.

## Schwierigkeitsstufen

| Level | Käfige | Benötigte Logik |
|---|---|---|
| 1 Leicht | überwiegend 2er-Käfige | Singles, Käfig-Kombinationen, Käfig liegt ganz in einer Einheit |
| 2 Mittel | klein | zusätzlich 45er-Regel |
| 3 Schwer | mittel | 45er-Regel, Innies/Outies |
| 4 Experte | groß | mehr als die eingebaute Logik |

In keinem Level gibt es Käfige aus nur einem Feld.

## Aufbau

| Datei | Inhalt |
|---|---|
| `js/generator.js` | Löser (Constraint-Propagation + Backtracking), Generator, Schwierigkeitsbewertung |
| `js/geometry.js` | Käfig-Umrisse (gemeinsam für Bildschirm und Bild) |
| `js/ink.js` | Tinte: Zeichnen und Radieren von Strichen |
| `js/snapshot.js` | PNG-Export |
| `js/app.js` | Oberfläche, Stifteingabe, Stoppuhr, Session-Protokoll |

## Tests

```sh
node test/gen-test.js     # Generator: Eindeutigkeit und Gültigkeit je Level
node test/e2e.mjs         # End-to-End in headless Chrome (Screenshots in test/out)
```
