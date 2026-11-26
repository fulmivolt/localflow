# Componenti di terze parti

L'archivio sorgente non include runtime di terze parti, pesi dei modelli o Node.js. Questi componenti restano soggetti alle loro licenze.

| Componente | Provenienza | Licenza / riferimento |
| --- | --- | --- |
| Transformers.js 3.8.1, bundle browser | `@huggingface/transformers` su jsDelivr/npm; versione e SHA-256 in `scripts/setup.mjs` | [Apache-2.0](https://github.com/huggingface/transformers.js/blob/3.8.1/LICENSE) |
| ONNX Runtime Web, incluso negli artefatti del runtime | Distribuzione browser di Transformers.js 3.8.1 | [MIT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) |
| Whisper Tiny ONNX | [onnx-community/whisper-tiny](https://huggingface.co/onnx-community/whisper-tiny) | [Whisper upstream MIT](https://github.com/openai/whisper/blob/main/LICENSE) |
| Whisper Base ONNX | [onnx-community/whisper-base](https://huggingface.co/onnx-community/whisper-base) | Apache-2.0 indicata nel repository di conversione; Whisper upstream MIT |
| SmolLM2 135M Instruct | [HuggingFaceTB/SmolLM2-135M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) | Apache-2.0, come indicato nella model card |
| Node.js e SQLite integrato | [Node.js](https://nodejs.org/) | [Licenze Node.js e componenti](https://github.com/nodejs/node/blob/main/LICENSE) |

Le revisioni esatte dei modelli sono in `lib/models.mjs`. Il programma scarica anche le model card quando disponibili. Prima di ridistribuire runtime o pesi in un pacchetto distinto, includere i testi di licenza e gli avvisi richiesti dai rispettivi componenti.
