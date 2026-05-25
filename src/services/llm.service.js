const callModule = require("./llmCall.service");
const adhocModule = require("./llmAdhoc.service");
const streamModule = require("./llmStream.service");

module.exports = {
  call: callModule.call,
  testPrompt: callModule.testPrompt,
  getModelContextLength: callModule.getModelContextLength,
  callAdhoc: adhocModule.callAdhoc,
  stream: streamModule.stream,
  streamAdhoc: streamModule.streamAdhoc,
};
