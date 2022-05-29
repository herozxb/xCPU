const main = async () => {
  const rv = new RV32ISystem();

  const file = await fs.readFile(path.join(__dirname, '..', 'system-code', 'main.bin'),"hex");
  var code = new Uint8Array(file.length/2);
  for(let i =0; i<file.length;i=i+2)
  {
     var num =  parseInt(file[i]+file[i+1], 16);
     code[i/2] = num ;
  }

  const program = new Uint32Array(code.length/4);
  
  
  for( let j=0; j<code.length;j=j+4)
  {
    var bytes = [];
    bytes.push(code[j+0])
    bytes.push(code[j+1])
    bytes.push(code[j+2])
    bytes.push(code[j+3])

    let uint8bytes = Uint8Array.from(bytes);
    let dataview = new DataView(uint8bytes.buffer);
    let int32le = dataview.getInt32(0, true); 

    program[j/4] = int32le;
  }

  

  

  rv.rom.load(program);

  rv.addBreakpoint(0x1000001c);

  while (true) {
    rv.cycle();
  }
}


0011011100010000 0x3710

0100000000100000 0x4020
