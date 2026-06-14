#!/usr/bin/env node
/**
 * Patches vendored ffmpeg.wasm artifacts so large exports write output to OPFS
 * instead of growing MEMFS. Re-run after replacing vendor/ffmpeg/* from upstream.
 */
const fs = require("fs");
const path = require("path");

const vendorDir = path.join(__dirname, "..", "vendor", "ffmpeg");
const corePath = path.join(vendorDir, "ffmpeg-core.js");
const workerPath = path.join(vendorDir, "814.ffmpeg.js");

const ORIG_EXEC =
  'function exec(..._args){const args=[...Module["DEFAULT_ARGS"],..._args];try{Module["_ffmpeg"](args.length,stringsToPtr(args))}catch(e){if(!e.message.startsWith("Aborted")){throw e}}return Module["ret"]}';

const OPFS_EXEC = `const OPFS_PREFIX="__opfs__/";let __opfsHandle=null;let __opfsOrigWrite=null;let __opfsOrigRead=null;let __opfsOrigAllocate=null;let __opfsOutputName=null;function __opfsIsOutputNode(node){return node&&__opfsOutputName&&node.name===__opfsOutputName}function __opfsInstallHooks(outputName,handle){__opfsOutputName=outputName;__opfsHandle=handle;__opfsOrigWrite=MEMFS.stream_ops.write;__opfsOrigRead=MEMFS.stream_ops.read;__opfsOrigAllocate=MEMFS.stream_ops.allocate;MEMFS.stream_ops.write=function(stream,buffer,offset,length,position,canOwn){if(__opfsIsOutputNode(stream.node)){if(!length)return 0;const chunk=buffer.subarray?buffer.subarray(offset,offset+length):new Uint8Array(buffer.slice(offset,offset+length));__opfsHandle.write(chunk,{at:position});stream.node.usedBytes=Math.max(stream.node.usedBytes||0,position+length);stream.node.timestamp=Date.now();stream.node.contents=null;return length}return __opfsOrigWrite.call(this,stream,buffer,offset,length,position,canOwn)};MEMFS.stream_ops.read=function(stream,buffer,offset,length,position){if(__opfsIsOutputNode(stream.node)){if(position>=(stream.node.usedBytes||0))return 0;const size=Math.min(stream.node.usedBytes-position,length);const tmp=new Uint8Array(size);const n=__opfsHandle.read(tmp,{at:position});buffer.set(tmp.subarray(0,n),offset);return n}return __opfsOrigRead.call(this,stream,buffer,offset,length,position)};MEMFS.stream_ops.allocate=function(stream,off,len){if(__opfsIsOutputNode(stream.node)){stream.node.usedBytes=Math.max(stream.node.usedBytes||0,off+len);return}return __opfsOrigAllocate.call(this,stream,off,len)}}function __opfsRemoveHooks(){if(__opfsOrigWrite){MEMFS.stream_ops.write=__opfsOrigWrite;__opfsOrigWrite=null}if(__opfsOrigRead){MEMFS.stream_ops.read=__opfsOrigRead;__opfsOrigRead=null}if(__opfsOrigAllocate){MEMFS.stream_ops.allocate=__opfsOrigAllocate;__opfsOrigAllocate=null}let bytes=0;if(__opfsHandle){try{bytes=__opfsHandle.getSize()}catch(e){}try{__opfsHandle.flush()}catch(e){}try{__opfsHandle.close()}catch(e){}__opfsHandle=null}__opfsOutputName=null;Module["__opfsOutputBytes"]=bytes;return bytes}async function exec(..._args){const userArgs=[..._args];let opfsOutputName=null;const last=userArgs[userArgs.length-1];if(typeof last==="string"&&last.startsWith(OPFS_PREFIX)){opfsOutputName=last.slice(OPFS_PREFIX.length);userArgs[userArgs.length-1]=opfsOutputName}const args=[...Module["DEFAULT_ARGS"],...userArgs];if(opfsOutputName&&typeof navigator!=="undefined"&&navigator.storage&&navigator.storage.getDirectory){const root=await navigator.storage.getDirectory();const fh=await root.getFileHandle(opfsOutputName,{create:true});const handle=await fh.createSyncAccessHandle({mode:"readwrite-unsafe"});handle.truncate(0);__opfsInstallHooks(opfsOutputName,handle);try{Module["_ffmpeg"](args.length,stringsToPtr(args))}catch(e){if(!e.message.startsWith("Aborted"))throw e}finally{__opfsRemoveHooks()}return Module["ret"]}try{Module["_ffmpeg"](args.length,stringsToPtr(args))}catch(e){if(!e.message.startsWith("Aborted"))throw e}return Module["ret"]}`;

const ORIG_WORKER_EXEC =
  "case t.EXEC:p=(({args:e,timeout:t=-1})=>{o.setTimeout(t),o.exec(...e);const r=o.ret;return o.reset(),r})(c);break;";

const PATCHED_WORKER_EXEC =
  "case t.EXEC:p=await(async({args:e,timeout:t=-1})=>{o.setTimeout(t);const u=o.exec(...e);u instanceof Promise&&await u;const r=o.ret;return o.reset(),r})(c);break;";

function patchFile(filePath, oldText, newText, label) {
  let content = fs.readFileSync(filePath, "utf8");
  if (content.includes(newText.slice(0, 80))) {
    console.log(`${label}: already patched`);
    return;
  }
  if (!content.includes(oldText)) {
    throw new Error(`${label}: expected source snippet not found — vendor files may have changed`);
  }
  content = content.replace(oldText, newText);
  fs.writeFileSync(filePath, content);
  console.log(`${label}: patched`);
}

patchFile(corePath, ORIG_EXEC, OPFS_EXEC, "ffmpeg-core.js");
patchFile(workerPath, ORIG_WORKER_EXEC, PATCHED_WORKER_EXEC, "814.ffmpeg.js");
