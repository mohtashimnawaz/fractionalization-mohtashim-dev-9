import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mintV1, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import {
  publicKey as umiPublicKey,
  none,
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

    // Build and sign with temp keypair to get the transaction structure
    const builtTx = await mintBuilder.buildAndSign(umi);
    
    console.log('✅ Built Bubblegum transaction with temp signer');

    // Convert to web3.js
    const web3Tx = toWeb3JsTransaction(builtTx);
    
    console.log('✅ Converted to web3.js transaction');

    // Get fresh blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    // Extract the message and create a new unsigned transaction
    // VersionedTransaction has a 'message' property we can use
    if ('message' in web3Tx) {
      // It's a VersionedTransaction - extract instructions and rebuild as legacy Transaction
      const message = web3Tx.message;
      const transaction = new Transaction({
        feePayer: new PublicKey(owner),
        recentBlockhash: blockhash,
      });

      // Extract instructions from the versioned transaction message
      // The message contains compiled instructions - we need to rebuild them
      console.log('⚠️ VersionedTransaction detected - extracting instructions manually');
      
      // For now, we'll serialize the versioned tx and let the client handle it
      const serializedTx = Buffer.from(web3Tx.serialize()).toString('base64');
      
      console.log('✅ Serialized VersionedTransaction for client');

      return NextResponse.json({
        success: true,
        message: 'VersionedTransaction ready - requires wallet signature',
        serializedTx,
        blockhash,
        lastValidBlockHeight,
        feePayer: owner,
        isVersioned: true,
      });
    } else {
      // It's a legacy Transaction
      const serializedTx = Buffer.from((web3Tx as Transaction).serialize()).toString('base64');

      console.log('✅ Transaction serialized (unsigned) for client signature');

      return NextResponse.json({
        success: true,
        message: 'Unsigned transaction ready for client signing',
        serializedTx,
        blockhash,
        lastValidBlockHeight,
        feePayer: owner,
      });
    }
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

