import dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import openai from 'openai';
import { ChromaClient } from 'chromadb';

dotenv.config();

const openaiClient = new openai.OpenAI();

const chromaClient = new ChromaClient({
    url: 'http://localhost:8000',
});
chromaClient.heartbeat();

const WEB_COLLECTION = `WEB_SCAPED_DATA_COLLECTION-1`;

async function scapeWebpage(url) {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const head = $('head').html();
    const body = $('body').html();

    const internalLinks = new Set();
    const externalLinks = new Set();

    $('a').each((_, element) => {
        const link = $(element).attr('href');
        if (link && link.startsWith('http') || link.startsWith('https')) {
            externalLinks.add(link);
        } else {
            internalLinks.add(link);
        }
    });

    console.log({internalLinks});

    return { head, body, internalLinks : Array.from(internalLinks), externalLinks : Array.from(externalLinks) };
}

    
    async function genrateVectorEmbeddings({ text}) {
        const embedding = await openaiClient.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
            encoding_format: 'float',
        });
        return embedding.data[0].embedding;
    }

    const collection = await chromaClient.getOrCreateCollection({
        name: WEB_COLLECTION,
        embeddingFunction: null
    });

    async function insertIntoDB({ embedding, url, body = "", head, id }) {
    await collection.add({
        ids: [String(id)],
        embeddings: [embedding],
        metadatas: [{ url, body, head }]
    });
}

    async function ingest(url = ''){
        console.log(`Ingesting ${url}`);
        const { head, body, internalLinks } = await scapeWebpage(url);
        const bodychunks = chunkText(body, 1000)

        for (const chunk of bodychunks) {
            const bodyEmbedding = await genrateVectorEmbeddings({ text: chunk });
            await insertIntoDB({ embedding: bodyEmbedding, url, body: chunk, head });
        }

    


        console.log(`Finished ingesting ${url}`);
    }

    await ingest('https://www.piyushgarg.dev');
    await ingest('https://www.piyushgarg.dev/cohort');
    await ingest('https://www.piyushgarg.dev/about');





function chunkText(text, chunkSize) {
  const tokens = text.split(/\s+/);
  const chunks = [];

  for (let i = 0; i < tokens.length; i += chunkSize) {
    chunks.push(tokens.slice(i, i + chunkSize).join(" "));
  }

  return chunks;
}