function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value instanceof Uint8Array
      ? value
      : new Uint8Array(value);
  const owned = bytes.slice().buffer as ArrayBuffer;
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", owned)));
}

export async function stableDocumentId(projectId: string, relativePath: string): Promise<string> {
  const digest = await sha256(`${projectId}\u0000${relativePath}`);
  return `doc_${digest.slice(0, 32)}`;
}
