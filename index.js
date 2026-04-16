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
        if (link && (link.startsWith('http://') || link.startsWith('https://'))) {
            externalLinks.add(link);
        } else if (link) {
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

        for (let i = 0; i < bodychunks.length; i++) {
        const chunk = bodychunks[i];

        const bodyEmbedding = await genrateVectorEmbeddings({
            text: chunk
        });

        await insertIntoDB({
            id: `${url}-chunk-${i}`,   // ✅ important
            embedding: bodyEmbedding,
            url,
            body: chunk,
            head
        });
    }
        

        console.log(`Finished ingesting ${url}`);
    }

    async function chat(question = '') {
        const questionEmbedding = await genrateVectorEmbeddings({ text: question });

        const collection = await chromaClient.getOrCreateCollection({
            name: WEB_COLLECTION,
            embeddingFunction: null
        });
        const colllectionResults = await collection.query({
            queryEmbeddings: [questionEmbedding],
            nResults: 3,
        });
        const body = colllectionResults.metadatas[0].map((e) => e.body).filter((e) => e.trim() !=='' && !!e);

        const url = colllectionResults.metadatas[0].map((e) => e.url).filter((e) => e.trim() !=='' && !!e);

        const response = await openaiClient.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `You are a helpful assistant. Use the following retrieved information from the web to answer the question. If you don't know the answer, say you don't know. Always use all the information you can get.`
                },
                {
                    role: 'user',
                    content: `
                    query: ${question}\n\n
                    urls: ${url.join(', ')}\n\n
                    retrieved information: ${body.join(',')}\n\n
                    `
                }
            ]
        });
        console.log({
            message: `🤖: ${response.choices[0].message.content}`,
            url: url[0]
        });   

    }



    // await ingest('https://www.piyushgarg.dev');
    await ingest('https://www.piyushgarg.dev/cohort');
    // await ingest('https://www.piyushgarg.dev/about');

    await chat('What is Cohort?');


function chunkText(text, chunkSize) {
  const tokens = text.split(/\s+/);
  const chunks = [];

  for (let i = 0; i < tokens.length; i += chunkSize) {
    chunks.push(tokens.slice(i, i + chunkSize).join(" "));
  }

  return chunks;
}