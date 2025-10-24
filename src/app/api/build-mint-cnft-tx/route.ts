import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mintV1, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import {
  publicKey as umiPublicKey,
  none,
  generateSigner,
  signerIdentity,
  createSignerFromKeypair,
} from '@metaplex-foundation/umi';
import { fromWeb3JsKeypair, toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, treeAddress, name, symbol, description, uri } = body;

    if (!owner || !treeAddress || !name || !symbol || !uri) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: owner, treeAddress, name, symbol, uri' },
        { status: 400 }
      );
    }

    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
    const endpoint = `https://api.${network}.solana.com`;
    const connection = new Connection(endpoint, 'confirmed');

    console.log('🔨 Building Bubblegum mint transaction on server');
    console.log('  Owner:', owner);
    console.log('  Tree:', treeAddress);
    console.log('  Name:', name);

    // Create a temporary keypair ONLY for building the transaction structure
    // This keypair is NOT used for signing - the client wallet will sign
    const tempKeypair = Keypair.generate();
    
    // Create UMI instance first
    let umi = createUmi(endpoint).use(mplBubblegum());
    
    // Then add the signer identity
    const tempUmiKeypair = fromWeb3JsKeypair(tempKeypair);
    const tempSigner = createSignerFromKeypair(umi, tempUmiKeypair);
    umi = umi.use(signerIdentity(tempSigner));

    const leafOwner = umiPublicKey(owner);
    const merkleTree = umiPublicKey(treeAddress);

    console.log('📝 Building Bubblegum mint instruction...');

    // Build the mint transaction with temp signer (needed by UMI)
    const mintBuilder = mintV1(umi, {
      leafOwner,
      merkleTree,
      metadata: {
        name,
        symbol,
        uri,
        sellerFeeBasisPoints: 500,
        collection: none(),
        creators: [
          {
            address: leafOwner,
            verified: false,
            share: 100,
          },
        ],
      },
    });

    // Get the instruction items without building the full transaction
    const ixs = mintBuilder.getInstructions();
    
    console.log('✅ Got Bubblegum instruction');

    // Get fresh blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    // Convert UMI instructions to web3.js Transaction
    // We need to manually build the transaction to avoid UMI's signing requirement
    const transaction = new Transaction({
      feePayer: new PublicKey(owner),
      recentBlockhash: blockhash,
    });

    // Add each instruction - cast to access UMI instruction properties
    interface UmiInstruction {
      programAddress: string;
      accounts?: Array<{ address: string; role: number }>;
      data: Uint8Array;
    }
    
    for (const ix of ixs) {
      const umiIx = ix as unknown as UmiInstruction;
      const keys = (umiIx.accounts || []).map((acc) => ({
        pubkey: new PublicKey(acc.address),
        isSigner: acc.role === 1 || acc.role === 3, // 1 = signer, 3 = writable+signer
        isWritable: acc.role === 2 || acc.role === 3, // 2 = writable, 3 = writable+signer
      }));

      transaction.add({
        programId: new PublicKey(umiIx.programAddress),
        keys,
        data: Buffer.from(umiIx.data),
      });
    }
    
    // Serialize unsigned transaction
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64');

    console.log('✅ Transaction serialized (unsigned) for client signature');

    return NextResponse.json({
      success: true,
      message: 'Unsigned transaction ready for client signing',
      serializedTx,
      blockhash,
      lastValidBlockHeight,
      feePayer: owner,
    });
  } catch (error) {
    console.error('❌ Error building transaction:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to build Bubblegum transaction',
      },
      { status: 500 }
    );
  }
}

