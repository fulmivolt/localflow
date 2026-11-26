# Verifica della versione 0.2.0

Data: 26 novembre 2026. Ambiente: Windows, Node.js 24.19.0, browser Chromium integrato.

## Verificato

- 7 test automatici passati: elaborazione Unicode, snippet, pulizia, estrazione della risposta OpenAI, ricampionamento audio, controllo di integrità e integrazione del server locale.
- Server su `127.0.0.1:4318`, interfaccia caricata e controllata visivamente.
- Setup del runtime browser completato con i tre hash SHA-256 fissati corrispondenti.
- Whisper Tiny installato dall'interfaccia: circa 45.2 MB, file verificati.
- Importazione del campione pubblico `jfk.wav` di whisper.cpp e trascrizione effettiva nel browser: «And so my fellow Americans ask not what your country can do for you, ask what you can do for your country.» Tempo mostrato dall'app: circa 4.1 secondi su questa macchina. Il tempo non è un benchmark riproducibile su altri computer.
- SmolLM2 135M installato e verificato (circa 185.5 MB), inferenza locale eseguita senza errori del runtime. **La qualità delle riscritture provate è insufficiente**: con un'istruzione italiana ha ripreso parte dell'istruzione; con un'istruzione inglese ha lasciato un errore grammaticale. Rimane un'opzione sperimentale, non il provider predefinito.
- Ripristinato il provider predefinito «Solo regole locali». Nessuna chiave reale è stata inserita.

## Non verificato dal vivo

- Registrazione della voce dell'utente dal microfono; il percorso di inferenza è stato provato con importazione audio.
- Whisper Base e prestazioni su computer differenti.
- Chiamate reali alle API OpenAI/Anthropic: richiedono una chiave dell'utente e disponibilità del modello nell'account. Il parsing OpenAI è coperto da test; questo non equivale a una chiamata reale.
- Compatibilità completa con browser diversi, Linux e macOS. Il workflow GitHub è incluso, ma non è stato eseguito su GitHub finché il repository non viene pubblicato.
- Nessuna certificazione antivirus o audit di sicurezza indipendente. La nuova app non genera o distribuisce un eseguibile Windows e non modifica le protezioni del sistema.

L'archivio sorgente esclude database, registrazioni, modelli scaricati, runtime scaricato, chiavi e il vecchio prototipo Tauri. Il campione audio usato per la prova non viene distribuito.
