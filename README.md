# Lambdagram
## A Tiny Cloud Service to Build Image Datasets with Instagram

### How to Use:
- Make a POST request with a JSON body of this shape:
```
{
  url: 'https://www.instagram.com/simoneugenemorrow'
  nextPage: 'your-lastSeenPageCursor-here' (optional)
}
```
Lambdagram returns up to 500 images at a time. If you receive fewer than 500 images, the account whose url you've passed has fewer than 500 posts.

To get more than 500 images from an account, pass the value of the `lastSeenPageCursor` in youre last request as `nextPage`. This tells Lambdagram to start parsing from the further down the page.

That's it!

Lambdagram responds with JSON of shape:
```
{
    "photos": [
        ... a whole bunch of image urls
    ],
    "total_images_on_acct": 101,
    "total_found_this_fetch": 101,
    "lastSeenPageCursor": "QVFBMVY5OFN2S3BFY1h3OVNJQ2FtaG9ULWc5NzB1d0J4Q2dlNkNMSGY2Mm5pSE5tV0NuRGZoY2hpTVI1RjFMQjcxeEE5c0NpQ2tqc2R5QW5zeWdQemdSWA=="
}
```

*Lambdagram* is an AWS Lambda built with [Clay](https://www.clay.run). Clay makes it super easy to write cloud functions and manage datasets with a hosted, setup-free, point-and-click Postgres database.
