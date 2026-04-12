/**
 * Browser-compatible Proof of Work miner using Web Crypto API.
 *
 * Finds a nonce such that SHA256(channel:author:timestamp:payloadHash:nonce)
 * has at least `difficulty` leading zero bits.
 */

export async function minePow(
  channel: string,
  author: string,
  payload: any,
  difficulty = 18,
): Promise<{ nonce: number; timestamp: number }> {
  // Hash payload
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  const payloadBuf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(json),
  );
  const payloadHash = [...new Uint8Array(payloadBuf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const timestamp = Date.now();
  let nonce = 0;

  while (true) {
    const challenge = `${channel}:${author}:${timestamp}:${payloadHash}:${nonce}`;
    const hash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(challenge),
      ),
    );

    // Check leading zero bits
    let zeroBits = 0;
    for (const byte of hash) {
      if (byte === 0) {
        zeroBits += 8;
        continue;
      }
      zeroBits += Math.clz32(byte) - 24;
      break;
    }
    if (zeroBits >= difficulty) return { nonce, timestamp };
    nonce++;

    // Yield every 4096 iterations to keep UI responsive
    if (nonce % 4096 === 0) await new Promise((r) => setTimeout(r, 0));
  }
}
