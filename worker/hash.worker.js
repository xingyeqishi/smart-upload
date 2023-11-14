importScripts('spark-md5.min.js');

self.addEventListener('message', async ({data}) => {
  const {file, chunkByte} = data;
  const chunks = Math.ceil(file.size / chunkByte);
  const chunkList = [];
  for (let i = 0; i < chunks; i++) {
    chunkList.push(file.slice(i * chunkByte, (i + 1) * chunkByte));
  }
  const promises = chunkList.map(
    chunk =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(chunk);
        reader.onload = e => {
          resolve(e.target.result);
        };
        reader.onerror = e => {
          reject(e);
        };
      })
  );
  const buffers = await Promise.all(promises);
  const spark = new SparkMD5.ArrayBuffer();
  const chunkMd5 = [];
  buffers.forEach((buffer, index) => {
    spark.append(buffer);
    chunkMd5.push(new SparkMD5.ArrayBuffer().append(buffer).end());
  });
  self.postMessage({md5: spark.end(), chunkMd5});
});
