# smart-upload

smart-upload is a JavaScript library for implementing chunked file uploads, designed to simplify the process of uploading large files with enhanced control over the upload process. It provides a set of APIs for configuration and uploading.

## Installation

You can install smart-Upload via npm

```
npm install smart-upload
```
Due to the use of the web worker for compute file hash, you need to add webpack configuration.
```
new CopyPlugin({
   patterns: [
     {
       from: paths.base('node_modules/smart-upload/worker/'),
       to: paths.dist('other/worker/')
     }
   ]
 }),
```
## Usage
### Configuration
Before uploading files, you need to configure Smart-Upload using the config API. The following parameters are available:

+ prefix: The prefix for loading web worker files. In comparison to the webpack configuration above, here you should write '/other'.
+ checkUrl: The URL for checking the status of uploaded chunks.
+ uploadUrl: The URL for uploading individual file chunks.
+ mergeUrl: The URL for merging uploaded chunks into the complete file.
+ concurrency: The number of concurrent upload tasks(default value 5).

Example:
```
import smartUpload from 'smart-upload';

const config = {
  checkUrl: '/check',
  uploadUrl: '/upload',
  mergeUrl: '/merge',
  concurrency: 3
};
smartUpload.config(config);
```

### Uploading
To initiate the file upload, use the upload API. Pass in the file to upload, a callback function for progress updates, and the URL for processing the uploaded chunks.
```
const fileInput = document.getElementById('fileInput');

smartUpload.upload({
  file: fileInput.files[0],
  onProgress: (chunk, totalChunk) => {
    console.log(`Uploading chunk: ${chunk}%`);
  },
  processUrl: '/process'
});
```
## License
This project is licensed under the MIT License - see the LICENSE file for details.
