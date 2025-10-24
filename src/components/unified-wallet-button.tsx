'use client'

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';

/**
 * Unified Wallet Button
 * 
 * Uses the standard Solana wallet-adapter UI button.
 * This ensures wallet-adapter is properly connected for Metaplex signing.
 * 
 * Replaces the wallet-ui dropdown to eliminate dual wallet system issues.
 */
export function UnifiedWalletButton() {
  return (
    <WalletMultiButton 
      style={{
        backgroundColor: 'transparent',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius)',
        height: '40px',
        fontSize: '14px',
      }}
    />
  );
}
