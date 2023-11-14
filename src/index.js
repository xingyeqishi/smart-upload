/**
 * 大文件分片上传,配合后端multipart-upload使用
 * 整体流程:check -> 检测文件是否存在
 *         upload -> 上传分片
 *         merge  -> 合成文件
 *         process -> 业务逻辑处理
 * @module smartUpload
 * @author sunxiaoshen
 */
import axios from './axios';
import SparkMD5 from 'spark-md5';
import pAll from 'p-all';
import {stringify} from 'querystring';

/**
 * 大文件分片上传
 * @param file 文件对象
 * @param onProgress 进度回调
 * @param processUrl 上传完成后的处理接口
 * @param checkUrl 检测文件是否存在接口
 * @param mergeUrl 合并文件接口
 * @param uploadUrl 上传文件接口
 */
const smartUpload = {
  workerPrefix: '',
  checkUrl: '',
  mergeUrl: '',
  uploadUrl: '',
  config: function ({workerPrefix, checkUrl, mergeUrl, uploadUrl}){
      console.log(this);
      this.workerPrefix = workerPrefix;
      this.checkUrl = checkUrl;
      this.mergeUrl = mergeUrl;
      this.uploadUrl = uploadUrl;
  },
  upload: async function(file, onProgress, processUrl) {
    let chunkByte = 10 * 1024 * 1024;
    if (file.size < chunkByte) {
      chunkByte = file.size;
    }
    onProgress && onProgress(1, 100);
    const {md5, chunkMd5} = await getFileMd5(file, chunkByte, this.workerPrefix);
    const {chunkSize, chunkList} = await splitChunks(file, chunkByte);
    const checkResult = await checkExistByMd5(this.checkUrl, md5, file.name, chunkSize);
    if (checkResult.status) {
      return await axios.post(this.processUrl, {path: checkResult.path});
    }
    const promises = chunkList.map((chunk, index) => () => {
      if (checkResult.chunk_ids.includes(index)) {
        return execUpload(this.uploadUrl, chunk, index, chunkMd5[index], md5, chunkSize, onProgress);
      }
      return true;
    });

    const results = await pAll(promises, {concurrency: 5, stepOnError: false});
    if (results.filter(i => i).length === results.length) {
      const mergeResult = await axios.post(this.mergeUrl, {filename: file.name, file_md5: md5});
      if (mergeResult.response_code === 0) {
        return await axios.post(processUrl, {path: mergeResult.data}).then(res => {
          onProgress && onProgress(chunkSize - 1, chunkSize);
          return res;
        });
      }
    }
    return Promise.resolve({response_code: -1});
  }
}

/**
 * 检测文件是否存在
 * @param checkUrl 检测文件是否存在接口
 * @param md5 文件md5
 * @param filename 文件名
 * @param chunkSize 分片数量
 */
const checkExistByMd5 = async (checkUrl, md5, filename, chunkSize) =>
  await axios.get(`${checkUrl}?${stringify({file_md5: md5, chunk_size: chunkSize, filename})}`).then(res => {
    if (res.response_code === 0) {
      return res.data;
    }
  });

/**
 * 执行上传
 * @param url 上传接口
 * @param chunk 分片
 * @param index 分片索引
 * @param chunkMd5 分片md5
 * @param md5 文件md5
 * @param chunkSize 分片数量
 * @param onProgress 进度回调
 */
const execUpload = async (url, chunk, index, chunkMd5, md5, chunkSize, onProgress) => {
  const formData = new FormData();
  formData.append('chunk', chunk);
  formData.append('chunk_md5', chunkMd5);
  formData.append('chunk_id', index);
  formData.append('file_md5', md5);
  return axios
    .post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    .then(res => {
      if (res.response_code === 0) {
        if (index < chunkSize - 1) {
          onProgress && onProgress(index, chunkSize);
        }
        return true;
      }
      console.error(`分片上传失败${index}`);
      return Promise.reject(false);
    });
};

/**
 * 文件分片
 * @param file 文件对象
 * @param chunkByte 分片大小
 */
const splitChunks = async (file, chunkByte) => {
  const chunkSize = Math.ceil(file.size / chunkByte);
  const chunkList = [];
  for (let i = 0; i < chunkSize; i++) {
    chunkList.push(await file.slice(i * chunkByte, (i + 1) * chunkByte));
  }
  return {
    chunkSize,
    chunkList
  };
};

/**
 * 获取待上传文件的md5
 * @param file 文件对象
 * @param chunkByte 分片大小
 */
const getFileMd5 = async (file, chunkByte, workerPrefix) => {
  if (window.hasOwnProperty('Worker')) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(`${location.origin}${workerPrefix}/worker/hash.worker.js`, {
        name: 'hash_worker'
      });
      worker.postMessage({file, chunkByte});
      worker.addEventListener('message', ({data}) => {
        worker.terminate();
        resolve(data);
      });
      worker.addEventListener('error', err => reject(err));
    });
  }
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
  return {md5: spark.end(), chunkMd5};
};

export default smartUpload;
