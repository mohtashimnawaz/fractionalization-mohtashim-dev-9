# Vercel Environment Variables Setup

## 🔐 Security Update: API Key Now Server-Side Only

Your Helius API key is now kept secure on the server and never exposed to the browser.

## Required Environment Variables in Vercel

Go to your Vercel project → Settings → Environment Variables and set these:

### 1. Helius API Key (SERVER-SIDE ONLY)
```
Name: HELIUS_API_KEY
Value: e8d45907-aaf1-4837-9bcd-b3652dcdaeb6
```
**Important:** Use `HELIUS_API_KEY` (without `NEXT_PUBLIC_` prefix)

### 2. Merkle Tree Address (CLIENT-SIDE)
```
Name: NEXT_PUBLIC_MERKLE_TREE_ADDRESS
Value: GjwHeTvnQm69xY4FmeH7T6VcTBg7TjTys3BB73ewYeL3
```
**Note:** Keeps the `NEXT_PUBLIC_` prefix as this needs to be accessible in the browser

### 3. Solana Network (CLIENT-SIDE)
```
Name: NEXT_PUBLIC_SOLANA_NETWORK
Value: devnet
```

## What Changed?

### Before (Insecure)
- Used `NEXT_PUBLIC_HELIUS_API_KEY`
- API key visible in browser console and network requests
- Anyone could see and steal your API key

### After (Secure) ✅
- Changed to `HELIUS_API_KEY` (server-side only)
- All Helius API calls go through `/api/helius` route
- API key never exposed to the browser
- Client-side code calls your API, which calls Helius

## Architecture

```
Browser → /api/helius → Helius DAS API
           (server)      (with API key)
```

### API Routes Created

1. **GET /api/helius?owner=<address>**
   - Fetches all compressed NFTs owned by an address
   - Used by: `useUserCNFTs` hook

2. **GET /api/helius?assetId=<id>**
   - Fetches detailed asset information
   - Used by: `useCNFTAsset` hook

3. **GET /api/helius?assetId=<id>&proof=true**
   - Fetches Merkle proof for a compressed NFT
   - Used by: `useCNFTProof` and `useFractionalize` hooks

## Testing Locally

Your `.env` file has been updated. Test with:

```bash
npm run dev
```

Then open the app and try loading your cNFTs. The API key will not appear in the browser console.

## Deployment

1. Update environment variables in Vercel (see above)
2. Commit and push your changes
3. Vercel will auto-deploy with the secure setup

## Verification

After deployment, check browser DevTools:
- Network tab should show requests to `/api/helius` (not Helius directly)
- Console should NOT show your API key
- Your cNFTs should still load correctly
