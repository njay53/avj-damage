/* modelle.js — Nachschlagewerk für die Schnellauswahl beim Anlegen
 *
 * Reine Tipphilfe. Die Auswahl schreibt in das Feld "Bezeichnung", danach ist
 * der Text ganz normal bearbeitbar — man kann also "#3" anhängen oder alles
 * überschreiben. Es wird bewusst NICHTS davon getrennt gespeichert: sonst
 * hätten wir eine zweite Wahrheit neben der Bezeichnung, und beim ersten
 * Fahrzeug, das nicht in die Liste passt, ginge das Aufräumen los.
 *
 * Die Liste ist auf den Fuhrpark einer Vermietung zugeschnitten — Kleinwagen,
 * Transporter, Kleinbusse, dazu die gängigen Anhängerhersteller. Sie muss
 * nicht vollständig sein, dafür gibt es "Andere/Anderes".
 *
 * HERKUNFT: von Hand zusammengetragen, keine offizielle Quelle. Es gibt keine
 * brauchbare Liste dieser Art zum Einbinden — das amtliche Verzeichnis des
 * Kraftfahrt-Bundesamts (HSN/TSN) kennt zwar jede Variante, aber eben auch
 * jede: mehrere zehntausend Zeilen mit Typschlüsseln statt der Namen, die man
 * im Betrieb benutzt. Deshalb hier eine gepflegte Handauswahl.
 *
 * Fehler bitte einfach hier korrigieren. Es hängt nichts daran: gespeichert
 * wird nur der Text, den die Auswahl ins Bezeichnungsfeld schreibt.
 */
(function (App) {
  "use strict";

  var MODELLE = {
    "Volkswagen": ["up!", "Polo", "Golf", "Golf Variant", "Passat", "Passat Variant",
      "T-Cross", "T-Roc", "Tiguan", "Touran", "Sharan",
      "Caddy", "Caddy Maxi", "Caddy Cargo",
      "Transporter T5", "Transporter T6", "Transporter T6.1", "Transporter T7",
      "Caravelle", "Multivan", "California", "ID. Buzz", "ID. Buzz Cargo",
      "Crafter", "Grand California", "Amarok"],
    "Toyota": ["Aygo", "Yaris", "Yaris Cross", "Corolla", "Corolla Touring Sports",
      "C-HR", "RAV4", "Auris", "Avensis", "Proace", "Proace City", "Proace Verso",
      "Hilux", "Land Cruiser"],
    "Ford": ["Ka+", "Fiesta", "Focus", "Focus Turnier", "Puma", "Kuga", "Mondeo",
      "C-Max", "S-Max", "Galaxy", "Tourneo Connect", "Tourneo Custom",
      "Transit Connect", "Transit Custom", "Transit", "Ranger"],
    "Opel": ["Karl", "Corsa", "Astra", "Astra Sports Tourer", "Crossland", "Grandland",
      "Mokka", "Insignia", "Zafira", "Combo Cargo", "Combo Life", "Vivaro",
      "Vivaro Combi", "Zafira Life", "Movano"],
    "Renault": ["Twingo", "Clio", "Captur", "Megane", "Megane Grandtour", "Scenic",
      "Kadjar", "Kangoo", "Kangoo Rapid", "Express", "Trafic", "Trafic Combi",
      "Master"],
    "Dacia": ["Sandero", "Sandero Stepway", "Logan MCV", "Duster", "Jogger", "Dokker",
      "Lodgy"],
    "Peugeot": ["108", "208", "2008", "308", "308 SW", "3008", "5008", "Rifter",
      "Partner", "Expert", "Traveller", "Boxer"],
    "Citroën": ["C1", "C3", "C3 Aircross", "C4", "C5 Aircross", "Berlingo",
      "SpaceTourer", "Jumpy", "Jumper"],
    "Fiat": ["500", "Panda", "Tipo", "500X", "Doblò", "Talento", "Scudo", "Ducato"],
    "Mercedes-Benz": ["A-Klasse", "B-Klasse", "C-Klasse", "C-Klasse T-Modell",
      "E-Klasse", "E-Klasse T-Modell", "GLA", "GLB", "GLC",
      "Citan Kastenwagen", "Citan Tourer",
      "Vito Kastenwagen", "Vito Mixto", "Vito Tourer", "eVito Tourer", "V-Klasse",
      "Sprinter Kastenwagen", "Sprinter Tourer", "Sprinter Pritsche",
      "Sprinter Fahrgestell", "eSprinter Kastenwagen"],
    "BMW": ["1er", "2er Active Tourer", "3er", "3er Touring", "5er", "X1", "X3"],
    "Audi": ["A1", "A3", "A3 Sportback", "A4", "A4 Avant", "A6", "Q2", "Q3", "Q5"],
    "Škoda": ["Citigo", "Fabia", "Fabia Combi", "Scala", "Octavia", "Octavia Combi",
      "Superb", "Superb Combi", "Kamiq", "Karoq", "Kodiaq", "Roomster"],
    "Seat": ["Mii", "Ibiza", "Arona", "Leon", "Leon Sportstourer", "Ateca", "Tarraco",
      "Alhambra"],
    "Hyundai": ["i10", "i20", "i30", "i30 Kombi", "Bayon", "Kona", "Tucson", "H-1",
      "Staria"],
    "Kia": ["Picanto", "Rio", "Ceed", "Ceed SW", "Stonic", "XCeed", "Sportage",
      "Carens", "Carnival"],
    "Nissan": ["Micra", "Juke", "Qashqai", "X-Trail", "NV200", "NV300", "NV400",
      "Townstar", "Primastar", "Interstar"],
    "Mazda": ["2", "3", "CX-3", "CX-30", "CX-5", "6", "6 Kombi"],
    "Honda": ["Jazz", "Civic", "HR-V", "CR-V"],
    "Suzuki": ["Swift", "Ignis", "Vitara", "S-Cross", "Jimny"],
    "Mitsubishi": ["Space Star", "ASX", "Eclipse Cross", "Outlander", "L200"],
    "Volvo": ["V40", "V60", "V90", "XC40", "XC60"],
    "Iveco": ["Daily", "Daily Kombi", "Daily Fahrgestell"],
    "MAN": ["TGE", "TGE Kombi"],
    /* Anhänger — im Fuhrpark eigene Kategorie, hier bei den Herstellern */
    "Anssems": ["GT", "GTB", "AMT", "PSX", "MSX"],
    "Humbaur": ["Steely", "HA", "HT", "HK", "Notos", "Xanthos"],
    "Böckmann": ["Tieflader TL", "Hochlader HL", "Kofferanhänger KH", "Autotransporter"],
    "Brenderup": ["1205", "1300", "2260", "3251", "4260", "5375"],
    "Stema": ["Basic", "Opti", "Systema", "Autotransporter"],
    "Unsinn": ["Tieflader", "Autotransporter", "Kofferanhänger"],
    "Saris": ["McAlu", "King", "Magnum", "Autotransporter"]
  };

  /* Alphabetisch, damit man in einer langen Liste etwas findet. */
  function hersteller() {
    return Object.keys(MODELLE).sort(function (a, b) {
      return a.localeCompare(b, "de");
    });
  }

  function modelle(marke) {
    return (MODELLE[marke] || []).slice();
  }

  App.Modelle = {
    hersteller: hersteller,
    modelle: modelle,
    _roh: MODELLE
  };

})(window.App = window.App || {});
