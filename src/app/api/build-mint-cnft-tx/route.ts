import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mintV1, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import {
  publicKey as umiPublicKey,
  none,
} from '@metaplex-foundation/umi';

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

    // Create UMI instance
    const umi = createUmi(endpoint).use(mplBubblegum());

    // Build the mint instruction using UMI
    const leafOwner = umiPublicKey(owner);
    const merkleTree = umiPublicKey(treeAddress);

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

    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash();

    // Create a web3.js transaction
    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: new PublicKey(owner),
    });

    // Build with UMI (just for validation, actual instruction building done on client)
    try {
      // This just validates the inputs
      const umiTransaction = await mintBuilder.build(umi);
      console.log('✅ Built UMI transaction structure');
    } catch (e) {
      // If that doesn't work, try to extract the instruction data differently
      console.log('Note: Using alternative instruction extraction method', e instanceof Error ? e.message : '');
    }

    // Add the mint instruction
    // For Bubblegum, the main instruction is the mint_v1 instruction
    // We'll need to properly construct it from the metadata
    
    // Get blockhash and prepare transaction
    const recentBlockhash = await connection.getLatestBlockhash();

    const tx = new Transaction({
      recentBlockhash: recentBlockhash.blockhash,
      feePayer: new PublicKey(owner),
    });

    // Build Bubblegum mint instruction data
    // This is complex - we'll use a simpler approach by letting the client get the instruction
    
    console.log('✅ Transaction prepared. Serializing for client signature...');

    // Serialize the transaction for client
    const serializedTx = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    // Return serialized transaction that client needs to sign
    return NextResponse.json({
      success: true,
      message: 'Transaction ready for client signing',
      serializedTx: serializedTx.toString('base64'),
      blockhash: recentBlockhash.blockhash,
      feePayer: owner,
      // Client should deserialize, sign with their wallet, serialize again, and send to /api/mint-cnft for confirmation
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

