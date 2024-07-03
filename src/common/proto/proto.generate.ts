const {exec} = require('child_process');
const path= require("node:path");


const pbjsBin = path.resolve(__dirname,"../../../", "node_modules/protobufjs-cli/bin/pbjs");
const pbtsBin = path.resolve(__dirname, "../../../","node_modules/protobufjs-cli/bin/pbts");


const jsFile = path.join(__dirname,"proto.js");
const tsFile = path.join(__dirname,"proto.d.ts");
const protoPaths = path.join(__dirname,"message.proto");
exec(`node ${pbjsBin} -t static-module -w commonjs -o ${jsFile} ${protoPaths}`, (error) => {
    if (error) {
        console.log(error)
    } else {

        exec(`node ${pbtsBin} -o ${tsFile} ${jsFile}`, (error) => {
            if (error) {
                console.log(error)
            } else {
                console.log('proto生成完成')
            }
        });
    }
});

