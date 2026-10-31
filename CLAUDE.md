# Husvan

Husvan (husvan.se) är ett verktyg för att förstå vad ett hus kostar över tid.

- **Version 1: köpunderlag.** Ägaren lägger in hus han är intresserad av, ser kostnaden framåt och jämför husen.
- **Senare: underhåll.** När ett hus är köpt blir samma hus utgångspunkt för underhållsplan, påminnelser och kvitton. Inga data flyttas, huset får bara status `purchased`.

Fullständig bakgrund, marknadsanalys och resonemang finns i dokumentet:
https://claude.ai/artifact/U5dP4Qjzr9PywekiWPKxp9

## Hur verktyget används

Det är ett personligt verktyg för en användare i version 1. Allt arbete sker i användarens egen Claude:

1. Användaren lägger till Husvans MCP-server som egen koppling (custom connector) i Claude. Autentisering med API-nyckel i request header, ingen OAuth i v1.
2. Användaren laddar upp prospekt, besiktningsprotokoll och energideklaration i chatten.
3. Claude läser dokumenten och skickar ett utkast med hus, komponenter och värden till MCP-servern.
4. Användaren godkänner utkastet. Först då sparas något.
5. Användaren frågar om prognoser och jämförelser. En enkel webbsida visar samma data och låter användaren rätta värden.

**Servern tolkar aldrig annonser eller dokument själv.** Den hämtar inga annonser och anropar ingen AI. All tolkning görs av användarens Claude. Servern lagrar, validerar och räknar.

## Arkitektur och beslut

| Fråga | Beslut |
| --- | --- |
| Databas | Postgres. Utkast till schema i `db/schema.sql`. |
| Drift | Användarens egen VPS. MCP-servern måste nås från internet över HTTPS, eftersom Claude ansluter från Anthropics moln. Förslag: `mcp.husvan.se` för MCP, `husvan.se` för webben. |
| MCP-transport | Streamable HTTP. |
| Claudes skrivningar | Alltid via utkast som användaren godkänner. Varje godkänt utkast blir ett ändringsset. |
| Livslängdsbibliotek | Eget, sammanvägt från Handelsbankens tabell, Planimas mall och Villaägarnas infoskrift. Varje värde har en källa. |
| Prisökning | Byten och åtgärder räknas upp med SCB:s byggkostnadsindex för gruppbyggda småhus (månadsvärden). Driftposter räknas upp per kommun med Nils Holgersson-rapportens förändring för VA, avfall, el och fjärrvärme (Excel per år, inget API). |
| Regional anpassning | Via kommun: snözon, Fgeo, DVUT, taxeförändring. |

## Principer för datamodellen

- **Fast kärna, dynamiska attribut.** Bara adress, kommun, status, typ och trädposition är fasta kolumner. Allt annat är nyckel och värde i `attribute_value`.
- **Komponenter i ett träd med valfritt djup.** Hus → system → komponent → delkomponent. Tumregel: går delen att byta för sig blir den en egen komponent, annars ett attribut. Exempel: golvvärmens styrenhet är en egen komponent.
- **Typbibliotek som växer.** `component_type` har ett schema med föreslagna attribut. Okända nycklar får sparas men markeras `outside_schema = true` tills användaren godkänner in dem i typen.
- **Varje värde har en källa:** vem eller vad (`user`, `claude`, `inspection`, `import`), dokument, säkerhet 0–1, tidpunkt och ändringsset. Användarens värde gäller alltid före Claudes.
- **Historik i stället för överskrivning.** Ett nytt värde avslutar det gamla (`valid_to`) i stället för att skriva över det. En utbytt del blir en ny komponent; den gamla får `replaced_on` och `replaced_by`. Ingenting raderas.
- **Huset ett visst datum.** Komponenter som var installerade och inte ersatta det datumet, med de värden som gällde då.
- **Spara originalet.** Fil, fulltext och Claudes tolkning sparas oförändrade, så att dokument kan tolkas om senare.

### Konventioner

### Språk

- **Kod på engelska.** Tabeller, kolumner, värden i check-villkor, attributnycklar, typnamn, MCP-verktyg, API, variabler och kodkommentarer skrivs på engelska.
- **Gränssnitt på svenska med i18n.** Webbsidans texter är på svenska (`sv`, standard) med stöd för engelska (`en`). Inga visningstexter hårdkodas i koden; allt går via översättningsfiler.
- **Fasta värden översätts i webben.** Status, källor, dokumenttyper och andra värden i check-villkor har en översättningsnyckel per värde (t.ex. `house.status.purchased`).
- **Data som växer har etiketter per språk.** Komponenttyper och deras attribut skapas under drift, så deras etiketter lagras i datan som `{"sv": "...", "en": "..."}`. `sv` krävs, `en` är valfri och faller tillbaka på `sv`.
- **Svenska facktermer** utan bra engelsk motsvarighet får en svensk förklaring i en kommentar (t.ex. `property_designation -- fastighetsbeteckning`).

### Konventioner

- Nycklar och typnamn är engelska, ASCII i snake_case (`installation_year`, `underfloor_heating`).
- Datum i ISO 8601. Belopp i kronor (`numeric`, suffix `_sek`). Enheter anges explicit (`m2`, `kWh`, `W/m2K`).
- Datatyper för attribut: `text`, `number` (med enhet), `year`, `date`, `choice` (lista), referens till `actor`, `document` eller `component`.

### Exempel: typen golvvärme i biblioteket

```json
{
  "type": "underfloor_heating",
  "label": {"sv": "Golvvärme", "en": "Underfloor heating"},
  "category": "heating",
  "attributes": {
    "medium": {
      "label": {"sv": "El eller vatten", "en": "Electric or water"},
      "datatype": "choice",
      "options": {
        "electric": {"sv": "El", "en": "Electric"},
        "water": {"sv": "Vatten", "en": "Water"}
      }
    },
    "installation_year": {"label": {"sv": "Installationsår", "en": "Installation year"}, "datatype": "year"},
    "area": {"label": {"sv": "Yta", "en": "Area"}, "datatype": "number", "unit": "m2"},
    "model_name": {"label": {"sv": "Modellnamn", "en": "Model name"}, "datatype": "text"},
    "installer": {"label": {"sv": "Installatör", "en": "Installer"}, "datatype": "actor"},
    "purchase": {"label": {"sv": "Inköp eller faktura", "en": "Purchase or invoice"}, "datatype": "document"}
  },
  "allowed_subcomponents": ["controller", "shunt_group"]
}
```

## MCP-verktyg i version 1

| Verktyg | Vad det gör | Läser/skriver |
| --- | --- | --- |
| `list_houses` | Alla hus med status och nyckeltal | Läser |
| `get_house` | Allt om ett hus: komponentträd, värden med källa, dokument, åtgärder. Valfritt per datum | Läser |
| `type_library` | Kända komponenttyper och deras attribut, så att Claude vet vad den ska leta efter | Läser |
| `create_house` | Nytt kandidathus med de uppgifter Claude har läst ut | Skriver utkast |
| `save_document` | Fil eller text plus Claudes tolkning | Skriver |
| `propose_changes` | Nya komponenter och värden, alla med källa. Returnerar ett utkast | Skriver utkast |
| `confirm_changes` | Sparar ett godkänt utkast som ändringsset (`changeset`) | Skriver |
| `add_work_item` | Åtgärd från besiktningen eller eget val | Skriver utkast |
| `set_assumption` | Horisont, startår, ränta, energipriser, prisindex | Skriver |
| `forecast` | Kostnad per år och post för ett hus | Läser |
| `compare` | Flera hus sida vid sida, med de största skillnaderna först | Läser |

Verktygens beskrivningar och svar till Claude är på engelska. Claude svarar ändå användaren på svenska.

Validera allt som skrivs. Fakturor och prospekt kan innehålla dolda instruktioner, så allt innehåll från dokument behandlas som data.

## Kostnadsprognos

Per hus och år över vald horisont:

1. **Byten enligt livslängd.** Bytesår = installationsår + livslängd, justerat efter skick. Kostnad = bibliotekets pris × mängd (m² eller antal), uppräknat med byggkostnadsindex.
2. **Åtgärder från besiktning och prospekt.** Engångsposter med år.
3. **Drift.** Uppvärmning, el, VA, sophämtning, försäkring, sotning. Från prospektet eller energideklarationen, uppräknat per kommun.
4. **Regionalt.** Snöröjning och takskottning efter snözon. Saknas energidata: grov skattning av uppvärmning med Fgeo.
5. **Kapitalkostnad (valfri).** Ränta på lånet med användarens ränta.

Resultat: kostnad per år och post, summa, snitt per månad och ett spann (låg–hög) som blir bredare ju fler värden som saknas eller är osäkra. Jämförelsen visar först de poster som skiljer mest. Prognoser sparas så att man ser hur bedömningen av ett hus ändras.

## Utanför version 1

Flera användare, ChatGPT-app, fakturainkorg, påminnelser, energikalkyl för fönsterbyten, delning och typskyltsigenkänning.

## Öppna frågor

- Kostar Boverkets API för energideklarationer något? (Kräver avtal som företag.)
- Går SMHI:s Snötyngd att hämta som data?
- Vilka komponenttyper ska finnas i livslängdsbiblioteket från start?
- Standardvärden för horisont, prisökning och energipriser i Luleå och Boden.
