# LocalFlow

Dettatura vocale open source, eseguita sul tuo computer dal codice sorgente. Interfaccia in italiano, riconoscimento multilingue con Whisper e supporto facoltativo alle API OpenAI e Anthropic (Claude).

**Nessun `.exe` dell'app, installer, Rust o compilazione nativa.** L'interfaccia si apre nel browser; un piccolo server Node.js conserva i dati sul dispositivo. Node.js e il browser sono prerequisiti installati separatamente: anche un'app eseguita da sorgente richiede un ambiente di esecuzione.

## Avvio da GitHub o dal pacchetto sorgente

1. Installa **Node.js 24 LTS** dal [sito ufficiale](https://nodejs.org/), se non è già presente. Usa una versione aggiornata di Chrome o Edge.
2. Su GitHub scegli **Code → Download ZIP**, poi estrai la cartella. In alternativa estrai l'archivio sorgente di LocalFlow. Non eseguirlo dentro lo ZIP.
3. Apri un terminale nella cartella contenente `package.json` ed esegui:

   ```sh
   npm run setup
   npm start
   ```

4. Apri **http://127.0.0.1:4318**. In **Modelli AI**, installa **Whisper Tiny**. Poi torna a **Dettatura** e premi il microfono. Consenti l'accesso al microfono quando il browser lo richiede.

Su Windows, se PowerShell blocca `npm.ps1`, usa `npm.cmd run setup` e `npm.cmd start`: non occorre cambiare la politica degli script. Non serve `npm install`.

Il setup scarica circa 23 MB di JavaScript e WebAssembly, verifica le impronte fissate nel sorgente e li conserva in `vendor/`. Whisper Tiny richiede circa 45 MB aggiuntivi. Internet serve per questi download iniziali; dopo, con **Regole locali** o un modello locale, la dettatura funziona offline. Tieni il terminale aperto e usa **Ctrl+C** per arrestare il server. Chiudere la scheda non arresta il server.

## Funzioni

- Registrazione dal microfono scelto, fino a 2 minuti; avvio/arresto anche con `Ctrl+Shift+Spazio` mentre la pagina è attiva.
- Importazione di file audio supportati dal browser, fino a 30 MB e 2 minuti.
- Whisper Tiny e Base multilingue, eseguiti localmente in WebAssembly.
- Dizionario di sostituzioni con confini di parola e importazione/esportazione JSON.
- Snippet richiamabili pronunciando l'intera frase di attivazione.
- Pulizia conservativa degli intercalari, senza inviare testo online.
- Cronologia locale modificabile e disattivabile; ricerca ed esportazione delle ultime 250 voci visualizzate.
- Blocco note con salvataggio, esportazione, riscrittura e annullamento dell'ultima riscrittura.
- SmolLM2 135M locale facoltativo per elaborazione del testo; OpenAI e Claude facoltativi con la propria chiave API.
- Download esplicito, annullamento, controllo dell'integrità ed eliminazione dei modelli.

## OpenAI e Claude

In **Impostazioni**, inserisci la chiave del provider. Le chiavi rimangono nella memoria del server e vanno reinserite dopo il suo riavvio. Non sono salvate nel database, nei file di configurazione o nel browser dall'app.

Seleziona esplicitamente il provider per l'elaborazione e salva le impostazioni, confermando l'invio del testo. Gli identificativi dei modelli sono modificabili: inserisci un modello disponibile nel tuo account. Le chiamate API possono avere costi secondo il tuo contratto con il provider.

**L'audio resta locale anche usando le API.** Al provider scelto vengono inviati il testo e l'istruzione di elaborazione. OpenAI usa l'API Responses con `store: false`; Anthropic usa Messages. Le politiche del provider continuano ad applicarsi. Nessuna chiamata cloud è necessaria per trascrivere con Whisper.

## Dati e sicurezza

Il server ascolta solo su `127.0.0.1`, non sulla rete locale. Controlla Host, Origin e un token casuale per le richieste API. L'interfaccia carica script e modelli esclusivamente dal server locale; non usa analytics, CDN a runtime o account obbligatori.

- `data/localflow.sqlite`: impostazioni, cronologia, dizionario, snippet e note. Questi dati **non sono cifrati**; proteggi l'account Windows e il disco.
- `data/models/`: modelli e manifest di integrità.
- `vendor/`: runtime browser scaricato dal setup.
- L'audio è elaborato in memoria e non viene salvato dall'app.

`data/` e `vendor/` sono esclusi da Git. Per un backup, arresta prima il server e copia `data/`; non caricarla su GitHub. Disattivare la cronologia impedisce nuove registrazioni testuali, senza cancellare quelle già presenti.

I download usano revisioni Hugging Face fissate, controllo della dimensione e SHA-256 dei pesi / hash Git dei file piccoli. Questi controlli verificano l'integrità, **non certificano l'assenza di malware**. Questa versione non richiede ripristini dalla quarantena, esclusioni antivirus o modifiche alle protezioni.

## Limiti della versione 0.2

È un'app locale nel browser, non un'app desktop nativa. Non offre scorciatoie globali, registrazione da altre applicazioni o incolla automatico: copia il risultato e usa `Ctrl+V` dove serve. Per questo non richiede accesso globale alla tastiera.

La registrazione si arresta manualmente o dopo 2 minuti; il controllo del silenzio è un controllo del livello, non un sistema VAD avanzato. La precisione dipende da microfono, rumore, lingua e modello. SmolLM2 135M è molto piccolo e soprattutto inglese: può peggiorare il testo o inventare contenuti; rivedi sempre le riscritture. Per l'italiano, la modalità iniziale **Regole locali** evita questo limite del piccolo modello di scrittura.

Non sono inclusi aggiornamenti automatici, cifratura del database, avvio al login o un servizio in background. L'interfaccia è in italiano; la dettatura può rilevare la lingua automaticamente oppure usare italiano, inglese, tedesco, francese o spagnolo.

## Sviluppo e pubblicazione su GitHub

Il progetto non richiede pacchetti npm di produzione o strumenti di compilazione:

```sh
npm test
node --check server.mjs
node --check public/app.js
node --check public/inference.js
```

I test coprono sostituzioni Unicode, snippet multilinea, pulizia, conversione audio, checksum, API locali, persistenza, protezione delle richieste e comportamento delle chiavi di sessione. Il workflow in `.github/workflows/test.yml` esegue i controlli su Node.js 24.

Per pubblicare, crea un repository nel tuo account e carica **solo il contenuto sorgente di questa cartella**, inclusi `.gitignore` e `.github/`. Non caricare `data/`, `vendor/`, chiavi API o cartelle di compilazione del precedente prototipo. Il pacchetto sorgente è pronto per GitHub; la sua preparazione non implica che esista già un repository pubblico.

Struttura: `server.mjs` contiene server e persistenza; `lib/` elaborazione e download; `public/` interfaccia, audio e worker AI; `scripts/setup.mjs` installazione verificata del runtime; `tests/` verifiche automatiche.

## Licenza

Codice LocalFlow sotto [licenza MIT](LICENSE). Runtime e modelli mantengono le proprie licenze: vedi [THIRD_PARTY.md](THIRD_PARTY.md). I pesi e il runtime non sono inclusi nell'archivio sorgente.

## English quick start

LocalFlow is a source-distributed local dictation app with an Italian UI. Install Node.js 24 LTS, extract the source ZIP, run `npm run setup`, then `npm start`. Open `http://127.0.0.1:4318`, install Whisper Tiny in **Modelli AI**, and start dictating. No application executable or native build is produced. After the initial runtime and model downloads, local modes work offline. Optional OpenAI/Anthropic APIs process text only; audio stays on your device. Global hotkeys and automatic insertion into other applications are not supported.
