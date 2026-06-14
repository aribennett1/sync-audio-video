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

const OPFS_MARKER = 'const OPFS_PREFIX="__opfs__/"';

const OPFS_EXEC = `const OPFS_PREFIX="__opfs__/";let __opfsHandle=null;let __opfsOutputName=null;let __opfsOrig={};function __opfsPathMatches(path){if(!__opfsOutputName||!path)return false;const n=__opfsOutputName;return path===n||path===("/"+n)||path.endsWith("/"+n)}function __opfsIsOutputNode(node){if(!node||!__opfsOutputName)return false;if(node.__opfsMarked)return true;if(node.name===__opfsOutputName)return true;try{return __opfsPathMatches(FS.getPath(node))}catch(e){return false}}function __opfsMarkNode(node){if(node)node.__opfsMarked=true}function __opfsSyncOpsTable(){if(!MEMFS.ops_table||!MEMFS.ops_table.file)return;const s=MEMFS.ops_table.file.stream;s.write=MEMFS.stream_ops.write;s.read=MEMFS.stream_ops.read;s.allocate=MEMFS.stream_ops.allocate;s.mmap=MEMFS.stream_ops.mmap}function __opfsInstallHooks(outputName,handle){__opfsOutputName=outputName;__opfsHandle=handle;__opfsOrig.write=MEMFS.stream_ops.write;__opfsOrig.read=MEMFS.stream_ops.read;__opfsOrig.allocate=MEMFS.stream_ops.allocate;__opfsOrig.mmap=MEMFS.stream_ops.mmap;__opfsOrig.expand=MEMFS.expandFileStorage;__opfsOrig.resize=MEMFS.resizeFileStorage;__opfsOrig.setattr=MEMFS.node_ops.setattr;__opfsOrig.open=FS.open;MEMFS.expandFileStorage=function(node,cap){if(__opfsIsOutputNode(node)){node.usedBytes=Math.max(node.usedBytes||0,cap);node.contents=null;return}return __opfsOrig.expand.call(this,node,cap)};MEMFS.resizeFileStorage=function(node,size){if(__opfsIsOutputNode(node)){node.usedBytes=size;node.contents=null;return}return __opfsOrig.resize.call(this,node,size)};MEMFS.node_ops.setattr=function(node,attr){if(__opfsIsOutputNode(node)){if(attr.mode!==undefined)node.mode=attr.mode;if(attr.timestamp!==undefined)node.timestamp=attr.timestamp;if(attr.size!==undefined){node.usedBytes=attr.size;node.contents=null}return}return __opfsOrig.setattr.call(this,node,attr)};FS.open=function(path,flags,mode){const fd=__opfsOrig.open.call(this,path,flags,mode);if(__opfsPathMatches(path)){const stream=FS.getStream(fd);if(stream&&stream.node)__opfsMarkNode(stream.node)}return fd};MEMFS.stream_ops.write=function(stream,buffer,offset,length,position,canOwn){if(__opfsIsOutputNode(stream.node)){__opfsMarkNode(stream.node);if(!length)return 0;const chunk=buffer.subarray?buffer.subarray(offset,offset+length):new Uint8Array(buffer.slice(offset,offset+length));__opfsHandle.write(chunk,{at:position});stream.node.usedBytes=Math.max(stream.node.usedBytes||0,position+length);stream.node.timestamp=Date.now();stream.node.contents=null;return length}return __opfsOrig.write.call(this,stream,buffer,offset,length,position,canOwn)};MEMFS.stream_ops.read=function(stream,buffer,offset,length,position){if(__opfsIsOutputNode(stream.node)){const used=stream.node.usedBytes||__opfsHandle.getSize();if(position>=used)return 0;const size=Math.min(used-position,length);const tmp=new Uint8Array(size);const n=__opfsHandle.read(tmp,{at:position});buffer.set(tmp.subarray(0,n),offset);return n}return __opfsOrig.read.call(this,stream,buffer,offset,length,position)};MEMFS.stream_ops.allocate=function(stream,off,len){if(__opfsIsOutputNode(stream.node)){stream.node.usedBytes=Math.max(stream.node.usedBytes||0,off+len);return}return __opfsOrig.allocate.call(this,stream,off,len)};MEMFS.stream_ops.mmap=function(stream,length,position,prot,flags){if(__opfsIsOutputNode(stream.node)){const used=stream.node.usedBytes||__opfsHandle.getSize();const want=Math.min(length,Math.max(0,used-position));const ptr=mmapAlloc(want);if(!ptr)throw new FS.ErrnoError(48);if(want>0){const tmp=new Uint8Array(want);__opfsHandle.read(tmp,{at:position});HEAP8.set(tmp,ptr)}return{ptr:ptr,allocated:true}}return __opfsOrig.mmap.call(this,stream,length,position,prot,flags)};__opfsSyncOpsTable()}function __opfsRemoveHooks(){if(__opfsOrig.write){MEMFS.stream_ops.write=__opfsOrig.write;__opfsOrig.write=null}if(__opfsOrig.read){MEMFS.stream_ops.read=__opfsOrig.read;__opfsOrig.read=null}if(__opfsOrig.allocate){MEMFS.stream_ops.allocate=__opfsOrig.allocate;__opfsOrig.allocate=null}if(__opfsOrig.mmap){MEMFS.stream_ops.mmap=__opfsOrig.mmap;__opfsOrig.mmap=null}if(__opfsOrig.expand){MEMFS.expandFileStorage=__opfsOrig.expand;__opfsOrig.expand=null}if(__opfsOrig.resize){MEMFS.resizeFileStorage=__opfsOrig.resize;__opfsOrig.resize=null}if(__opfsOrig.setattr){MEMFS.node_ops.setattr=__opfsOrig.setattr;__opfsOrig.setattr=null}if(__opfsOrig.open){FS.open=__opfsOrig.open;__opfsOrig.open=null}__opfsSyncOpsTable();let bytes=0;if(__opfsHandle){try{bytes=__opfsHandle.getSize()}catch(e){}try{__opfsHandle.flush()}catch(e){}try{__opfsHandle.close()}catch(e){}__opfsHandle=null}__opfsOutputName=null;Module["__opfsOutputBytes"]=bytes;return bytes}async function exec(..._args){const userArgs=[..._args];let opfsOutputName=null;const last=userArgs[userArgs.length-1];if(typeof last==="string"&&last.startsWith(OPFS_PREFIX)){opfsOutputName=last.slice(OPFS_PREFIX.length);userArgs[userArgs.length-1]=opfsOutputName}const args=[...Module["DEFAULT_ARGS"],...userArgs];if(opfsOutputName&&typeof navigator!=="undefined"&&navigator.storage&&navigator.storage.getDirectory){const root=await navigator.storage.getDirectory();const fh=await root.getFileHandle(opfsOutputName,{create:true});const handle=await fh.createSyncAccessHandle({mode:"readwrite-unsafe"});handle.truncate(0);__opfsInstallHooks(opfsOutputName,handle);try{Module["_ffmpeg"](args.length,stringsToPtr(args))}catch(e){if(!e.message.startsWith("Aborted"))throw e}finally{__opfsRemoveHooks()}return Module["ret"]}try{Module["_ffmpeg"](args.length,stringsToPtr(args))}catch(e){if(!e.message.startsWith("Aborted"))throw e}return Module["ret"]}`;

const ORIG_WORKER_EXEC =
  "case t.EXEC:p=(({args:e,timeout:t=-1})=>{o.setTimeout(t),o.exec(...e);const r=o.ret;return o.reset(),r})(c);break;";

const PATCHED_WORKER_EXEC =
  "case t.EXEC:p=await(async({args:e,timeout:t=-1})=>{o.setTimeout(t);const u=o.exec(...e);u instanceof Promise&&await u;const r=o.ret;return o.reset(),r})(c);break;";

function patchCore(content) {
  const markerIdx = content.indexOf(OPFS_MARKER);
  const setLoggerIdx = content.indexOf("function setLogger");

  if (markerIdx >= 0 && setLoggerIdx > markerIdx) {
    return (
      content.slice(0, markerIdx) + OPFS_EXEC + content.slice(setLoggerIdx)
    );
  }

  if (!content.includes(ORIG_EXEC)) {
    throw new Error(
      "ffmpeg-core.js: expected source snippet not found — vendor files may have changed"
    );
  }

  return content.replace(ORIG_EXEC, OPFS_EXEC);
}

function patchWorker(content) {
  if (content.includes(PATCHED_WORKER_EXEC)) {
    return content;
  }
  if (!content.includes(ORIG_WORKER_EXEC)) {
    throw new Error(
      "814.ffmpeg.js: expected EXEC handler not found — vendor files may have changed"
    );
  }
  return content.replace(ORIG_WORKER_EXEC, PATCHED_WORKER_EXEC);
}

const coreBefore = fs.readFileSync(corePath, "utf8");
const coreAfter = patchCore(coreBefore);
fs.writeFileSync(corePath, coreAfter);
console.log(
  coreBefore === coreAfter
    ? "ffmpeg-core.js: unchanged"
    : "ffmpeg-core.js: patched"
);

const workerBefore = fs.readFileSync(workerPath, "utf8");
const workerAfter = patchWorker(workerBefore);
fs.writeFileSync(workerPath, workerAfter);
console.log(
  workerBefore === workerAfter
    ? "814.ffmpeg.js: unchanged"
    : "814.ffmpeg.js: patched"
);
