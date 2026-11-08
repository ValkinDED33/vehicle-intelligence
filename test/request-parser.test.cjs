require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {gzipSync}=require('node:zlib');
const {NestFactory}=require('@nestjs/core');
const {Controller,Module,Post,Body,HttpCode}=require('@nestjs/common');

test('malformed compressed JSON is rejected and the real Nest HTTP parser remains available',async()=>{
  class EchoController { echo(body){return body;} }
  Controller('parser-fixture')(EchoController);
  const descriptor=Object.getOwnPropertyDescriptor(EchoController.prototype,'echo');
  Post()(EchoController.prototype,'echo',descriptor);HttpCode(200)(EchoController.prototype,'echo',descriptor);
  Body()(EchoController.prototype,'echo',0);
  class App{}
  Module({controllers:[EchoController]})(App);
  const app=await NestFactory.create(App,{logger:false});
  try {
    await app.listen(0,'127.0.0.1');const url=await app.getUrl();
    const body={fixture:true};const compressed=gzipSync(JSON.stringify(body));
    const request=payload=>fetch(url+'/parser-fixture',{method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},body:payload,signal:AbortSignal.timeout(3000)});
    const invalid=await request(Buffer.concat([compressed,Buffer.from('invalid trailing bytes')]));
    assert.equal(invalid.status,400);await invalid.arrayBuffer();
    const valid=await request(compressed);assert.equal(valid.status,200);assert.deepEqual(await valid.json(),body);
  } finally {await app.close();}
});
