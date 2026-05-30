import { GoogleGenAI } from '@google/genai';
async function test() {
  try {
    const ai = new GoogleGenAI({ apiKey: '' });
    await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: 'hello'
    });
  } catch (e) {
    console.error(e);
  }
}
test();
