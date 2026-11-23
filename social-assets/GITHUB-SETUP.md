# GitHub repository setup

Steps to do by hand on github.com for https://github.com/RaydanAridiCS/toolwright. Each one takes a minute. You need to be signed in as the repository owner.

## 1. Description, website and topics

1. Open https://github.com/RaydanAridiCS/toolwright.
2. On the right side of the page, next to **About**, click the gear icon.
3. **Description**: paste this (143 characters, the limit is 350 and search results show about 160):

   ```
   Free, open-source tools for PDFs, images, code and text that run in your browser. Files are processed on your device, not uploaded. No account.
   ```

   It leaves out the tool count on purpose so it does not go stale. If you want the count, use this one (113 characters) and update it when tools are added:

   ```
   138 free, open-source tools for PDFs, images, code and text. They run in your browser, so files are not uploaded.
   ```

4. **Website**: `https://toolwright.com`
5. **Topics**: type each one and press Enter after it:

   ```
   privacy
   open-source
   pdf
   pdf-tools
   image-compression
   developer-tools
   browser
   nextjs
   typescript
   client-side
   ```

6. Under **Include in the home page**, leave **Releases** and **Packages** as you like. Untick **Deployments** if it shows nothing useful.
7. Click **Save changes**.

## 2. Social preview image

This is the picture shown when the repository link is shared on X, LinkedIn, Slack and other sites.

1. Make sure you have the file locally: `docs/images/social-preview.png` (1280x640 PNG, under 1 MB).
2. In the repository, click **Settings** (top bar, far right; you need to be the owner).
3. Stay on the **General** page and scroll down to **Social preview**.
4. Click **Edit**, then **Upload an image...**, and choose `docs/images/social-preview.png`.
5. The preview appears in the box. There is no save button: it is stored as soon as the upload finishes.
6. To check it, paste the repository link into a new X or LinkedIn post draft (do not publish). Sites cache previews, so an old picture can stay for a while.

The image shows the tool count (138 on 2026-11-23). When the count changes, update the number in `social-assets/src/social-preview.html`, run `node scripts/render-brand-assets.mjs` and upload the new PNG again.

## 3. Pin the repository on your profile

1. Open your profile: https://github.com/RaydanAridiCS.
2. Under your bio, find **Popular repositories** (or **Pinned** if you already pinned something) and click **Customize your pins**.
3. Tick **toolwright**. You can pin up to six repositories.
4. Drag it to the first position in the list if you want it first.
5. Click **Save pins**.

## Checklist

- [ ] Description saved
- [ ] Website set to https://toolwright.com
- [ ] 10 topics added
- [ ] Social preview uploaded
- [ ] Repository pinned on the profile
