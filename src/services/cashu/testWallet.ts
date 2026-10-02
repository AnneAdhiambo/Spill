import { Amount, MintQuoteState, Wallet, getEncodedToken, getTokenMetadata, type Proof, type ProofLike } from "@cashu/cashu-ts";

const defaultTestMint = "https://nofees.testnut.cashu.space";
const mintUrl = (import.meta.env.VITE_CASHU_TEST_MINT || defaultTestMint).replace(/\/$/, "");
const proofsKey = "spill.cashu-test-wallet.proofs";

type StoredProof = Omit<ProofLike, "amount"> & { amount: string };

export type CashuTopUpQuote = {
  quoteId: string;
  invoice: string;
  amount: number;
};

function toStoredProof(proof: Proof): StoredProof {
  return { ...proof, amount: proof.amount.toString() };
}

function fromStoredProof(proof: StoredProof): Proof {
  return { ...proof, amount: Amount.from(proof.amount) };
}

function readProofs(): Proof[] {
  try {
    const stored = localStorage.getItem(proofsKey);
    if (!stored) return [];
    return (JSON.parse(stored) as StoredProof[]).map(fromStoredProof);
  } catch {
    return [];
  }
}

function storeProofs(proofs: Proof[]): void {
  localStorage.setItem(proofsKey, JSON.stringify(proofs.map(toStoredProof)));
}

function getBalance(proofs: Proof[]): number {
  return proofs.reduce((total, proof) => total + proof.amount.toNumber(), 0);
}

async function openWallet(): Promise<Wallet> {
  const wallet = new Wallet(mintUrl, { unit: "sat" });
  await wallet.loadMint();
  return wallet;
}

function isTrustedTestMint(tokenMint: string): boolean {
  return tokenMint.replace(/\/$/, "") === mintUrl;
}

export const cashuTestWallet = {
  mintUrl,

  getBalance(): number {
    return getBalance(readProofs());
  },

  async receiveToken(token: string): Promise<number> {
    const metadata = getTokenMetadata(token.trim());
    if (metadata.unit !== "sat") throw new Error("This test wallet accepts sat-denominated tokens only.");
    if (!isTrustedTestMint(metadata.mint)) {
      throw new Error("This token is from a different mint. Use a token from the configured Cashu test mint.");
    }

    const wallet = await openWallet();
    const receivedProofs = await wallet.ops.receive(token.trim()).run();
    const proofs = [...readProofs(), ...receivedProofs];
    storeProofs(proofs);
    return getBalance(proofs);
  },

  async createTopUpQuote(amount: number): Promise<CashuTopUpQuote> {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Enter a whole number of sats.");
    const wallet = await openWallet();
    const quote = await wallet.createMintQuoteBolt11(amount);
    return { quoteId: quote.quote, invoice: quote.request, amount };
  },

  async claimTopUpQuote(quote: CashuTopUpQuote): Promise<{ paid: boolean; balance: number }> {
    const wallet = await openWallet();
    const checkedQuote = await wallet.checkMintQuoteBolt11(quote.quoteId);
    if (checkedQuote.state !== MintQuoteState.PAID) {
      return { paid: false, balance: this.getBalance() };
    }

    const mintedProofs = await wallet.mintProofsBolt11(quote.amount, checkedQuote.quote);
    const proofs = [...readProofs(), ...mintedProofs];
    storeProofs(proofs);
    return { paid: true, balance: getBalance(proofs) };
  },

  async createSupportToken(amount: number): Promise<{ token: string; balance: number }> {
    const proofs = readProofs();
    if (getBalance(proofs) < amount) throw new Error("Not enough Private Credits.");

    const wallet = await openWallet();
    const { keep, send } = await wallet.ops.send(amount, proofs).run();
    storeProofs(keep);
    const token = getEncodedToken({ mint: mintUrl, proofs: send, unit: "sat", memo: "Spill private support" });
    return { token, balance: getBalance(keep) };
  },
};
