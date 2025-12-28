
const fs = require('fs');

async function testR2Flow() {
    const syncKey = 'test-verification-user';
    const pdfId = 'pdf_' + Date.now();
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';

    // 1. Create a dummy PDF file content
    const fileContent = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 300 144]>>endobj xref 0 4 0000000000 65535 f 0000000010 00000 n 0000000060 00000 n 0000000110 00000 n trailer<</Size 4/Root 1 0 R>> startxref 190 %%EOF';
    
    // 2. Prepare the multipart body manually since we don't have 'form-data' package installed by default in some envs, 
    // but actually, we can just use fetch with FormData if available in Node 18+.
    // Let's assume Node 18+ is available.
    
    
    try {
        // 0. Sync first to create the user
        console.log(`[TEST] Creating user with syncKey: ${syncKey}...`);
        const syncRes = await fetch('http://localhost:8787/api/sync', {
            method: 'POST',
            body: JSON.stringify({ syncKey }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!syncRes.ok) {
            console.error('[FAIL] User creation failed:', await syncRes.text());
            return;
        }

        const formData = new FormData();
        const blob = new Blob([fileContent], { type: 'application/pdf' });
        formData.append('file', blob, 'test.pdf');
        formData.append('id', pdfId);
        formData.append('syncKey', syncKey);

        console.log(`[TEST] Uploading PDF with ID: ${pdfId}...`);
        const uploadRes = await fetch('http://localhost:8787/api/assets/upload', {
            method: 'POST',
            body: formData
        });

        if (!uploadRes.ok) {
            console.error('[FAIL] Upload failed:', await uploadRes.text());
            return;
        }
        console.log('[PASS] Upload successful', await uploadRes.json());

        // 3. Verify D1 status (Simulated by checking if we can download it, or we can trust the upload success for R2)
        // Ideally we would query D1 here, but we can't easily do that from this script without wrangler.
        // So we will try to download it back.

        console.log(`[TEST] Downloading PDF with ID: ${pdfId}...`);
        const downloadRes = await fetch(`http://localhost:8787/api/assets/download/${pdfId}`);
        
        if (!downloadRes.ok) {
            console.error('[FAIL] Download failed:', await downloadRes.text());
            return;
        }

        const downloadedText = await downloadRes.text();
        if (downloadedText === fileContent) {
            console.log('[PASS] Downloaded content matches uploaded content.');
        } else {
            console.error('[FAIL] Content mismatch.');
            console.log('Expected:', fileContent);
            console.log('Received:', downloadedText);
        }

    } catch (e) {
        console.error('[ERROR] Exception:', e);
    }
}

testR2Flow();
