/*
    Moac app chain library
    Written by Gao Ji Hua 2019/11
App chain call
    1 GetNonce：获得应用链的nonce，这是调用应用链DAPP合约的必要参数之一，每当应用链交易发送后会自动加1

    2 GetBlockNumber：获得当前应用链的区块高度
    3GetBlock: 获得当前应用链的指定的区块信息

    4GetBlocks: 获取某一区间内的区块信息

    5GetSubChainInfo：获得当前应用链的信息

    6GetTxpool：获得应用链交易池信息

    7GetTxpoolCount：获得应用链交易池中不同类型交易的数量

    8GetBalance：获得对应账号在应用链中的余额

    9GetDappState：获得应用链基础合约合约的状态

    10GetDappAddrList：通过subchainaddr获取应用链内所有多合约的地址列表，需要应用链业务逻辑合约调用基础合约registerDapp方法后才能生效，具体请参见“母应用链货币交互简介”中的示例

    11GetExchangeInfo：获得应用链指定数量正在充提的信息

    12 GetExchangeByAddress：获得应用链指定账号指定数量的充提信息

    13GetTransactionByNonce: 通过账号和Nonce获取应用链的tx信息

    14GetTransactionByHash: 通过交易hash获取应用链的tx信息

    15 GetReceiptByNonce: 通过账号和Nonce获取应用链的tx执行结果

    16GetReceiptByHash: 通过交易hash获取应用链的tx执行结果

    17  此部分合约需要指明是哪个业务逻辑合约

    AnyCall: 获取dapp合约函数的返回值，调用此接口前必须将dapp注册入dappbase

    Params： 第一个参数是调用的方法，之后是方法传入参数

    18 调用registerAsMonitor参数说明:

    19 dapp creation. 充值,


*/
Chain3 = require("chain3");

solc = require("solc");
//var ABIs = require('./mcABIs');
request = require('request');
ABIs = require('./mcABIs');
var SolDir = "./sol";
let decimals = 18;

/* 
const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
} */

function sleep(milliseconds) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds) {
      break;
    }
  }
}

class SubChain {

  constructor(url, addr, scsaddr) {
    this.Chain3URL = url;
    this.chain3 = new Chain3();
    this.chain3.setProvider(
      new this.chain3.providers.HttpProvider(this.Chain3URL)
    );
    this.ScsURL = scsaddr;     //'http://localhost:8548'
    this.chain3.setScsProvider(new this.chain3.providers.HttpProvider(this.ScsURL));
    if (!this.chain3.isConnected()) {
      console.log("Chain3 RPC is not connected!");
      return;
    }


    this._addr = addr;
    this._scsaddr = scsaddr;  //scs 节点rpc 
    this._VnodeBenificialAddr = "0xa66f32cf93ab13724ee732c2cbd679946be2f8f7";
    this._mainaccount = "0x42ff541de733a175babb9a4f76efeaf78b46ecad";
    this._password = "qweasdzxc";

    this._monitor = "";

    var mcabi = this.ABIs.astABI;//load in the MicroChain ABI from external file
    // Create the appChainBase Object with abi
    try {
      this.appChainBase = this.chain3.microchain(JSON.parse(mcabi));

      // Need to setup the via address
      this.appChainBase.setVnodeAddress(this._VnodeBenificialAddr);

      this.appChainInstance = this.appChainBase.at(this._addr);  // this subchain instance


      this.mclist = this.chain3.scs.getMicroChainList();
      this.applist = this.chain3.scs.getDappAddrList(this._addr);
      this.dappBaseContractAddr = this.applist[0];
      //this.selfLoop();
    } catch (e) {
      console.log("error in appchain, you show renew!");
      console.log(e);
    }

  }

  //返回是否链接
  isConnect() {
    return this.chain3.isConnected();
  }

  get ABIs() {
    return ABIs;
  }
  /*   //完全是迷惑作用
    get appChain() {
  
      return new this.MicroChain(this.Chain3URL, this.ScsURL, this._addr, this._VnodeBenificialAddr);
    } */
  // Wait for results to come
  waitForMicroChainBlocks(inMcAddr, innum) {
    let startBlk = this.chain3.scs.getBlockNumber(inMcAddr);
    let preBlk = startBlk;
    console.log("等待app区块链处理智能合约 " + startBlk);
    while (true) {
      let curblk = this.chain3.scs.getBlockNumber(inMcAddr);
      if (curblk > startBlk + innum) {
        console.log("完成等待 " + innum + " 个区块!");
        break;
      }
      if (curblk > preBlk) {
        console.log("继续等待区块链处理: " + curblk);
        preBlk = curblk;
      } /* else {
        console.log("..");
      } */
      sleep(3000000);
    }
  }

  // Functions to use in the process
  // Send TX with unlock account and Sharding Flag set
  sendshardingflagtx(amount, code, nonce, shardingflag) {
    this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);
    return this.chain3.mc.sendTransaction(
      {
        from: this.MainAccount,
        value: this.chain3.toSha(amount, 'mc'),
        to: this._addr,
        gas: "0",
        gasPrice: this.chain3.mc.gasPrice,
        shardingFlag: shardingflag,
        data: code,
        nonce: nonce,
        via: this._VnodeBenificialAddr,
      });
  }

  // check transactions hash finished 
  waitBlock(transactionHash) {
    console.log("等待矿工完成合约的工作...");

    while (true) {
      let receipt = this.chain3.mc.getTransactionReceipt(transactionHash);
      if (receipt && receipt.contractAddress) {
        console.log("合约工作完成,地址为: " + receipt.contractAddress);
        break;
      }
      console.log("block " + this.chain3.mc.blockNumber + "...");
      sleep(50000);
    }
    return this.chain3.mc.getTransactionReceipt(transactionHash).contractAddress;
  }

  // check transactions hash finished 
  waitMicroTransaction(transactionHash) {
    console.log("等待应用链矿工完成合约的工作...");

    while (true) {
      let receipt = this.chain3.scs.getReceiptByHash(this._addr, transactionHash);
      if (receipt && receipt.contractAddress) {
        console.log(receipt);
        console.log("合约工作完成,地址为: " + receipt.contractAddress);
        break;
      }
      console.log("block " + this.chain3.mc.blockNumber);
      sleep(50000);
    }
    return this.chain3.scs.getReceiptByHash(this._addr, transactionHash).contractAddress;
  }

  //注册app chain的监控地址
  setMonitorAddr(monitoracct, monitorurl) {
    let me = this;
    if (monitorurl != undefined) {
      this._monitor = monitorurl;
    }
    console.log("register monitor %s", this._monitor);
    let data = this.appChainInstance.registerAsMonitor.getData(monitoracct, this._monitor);
    /* 
        let SubchainbaseContract = this.chain3.mc.contract(JSON.parse(this.ABIs.astABI));
        let SubChainBase = SubchainbaseContract.at(this._addr);
        let data = SubChainBase.registerAsMonitor.getData(monitoracct, this._monitor); // this.monitor assign in construction
     */

    console.log(data);
    //0x4e592e2f000000000000000000000000ac.
    // urladdr monitor scs node main account"
    //console.log(data);
    try {
      if (this._monitor != null) {

        this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);

        var tx = this.chain3.mc.sendTransaction({
          from: this.MainAccount,
          value: 0,
          to: this._addr,
          gas: "5000000",
          gasPrice: this.chain3.mc.gasPrice,
          data: data
        });
        console.log("tx:", tx);
        me.waitBlock(tx);
      }

    } catch (e) {
      console.log(e);
    }
  }
  //删除monitor
  removeMonitor(address) {
    let me = this;

    console.log("remove monitor %s", this._monitor);

    let SubchainbaseContract = this.chain3.mc.contract(JSON.parse(this.ABIs.astABI));
    let SubChainBase = SubchainbaseContract.at(this._addr);
    let data = SubChainBase.removeMonitorInfo.getData(address); // this.monitor assign in construction
    console.log(data);
    // urladdr monitor scs node main account"
    //console.log(data);
    try {
      if (this._monitor != null) {

        this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);

        var tx = this.chain3.mc.sendTransaction({
          from: this.MainAccount,
          value: this.chain3.toSha(1, 'mc'),
          to: this._addr,
          gas: "5000000",
          gasPrice: this.chain3.mc.gasPrice,
          data: data
        });
        console.log("tx:", tx);
        me.waitBlock(tx);
      }

    } catch (e) {
      console.log(e);
    }
  }

  get MonitorInfo() {
    let me = this;
    //let SubchainbaseContract = this.chain3.mc.contract(JSON.parse(this.ABIs.astABI));
    //let SubChainBase = SubchainbaseContract.at(this._addr);
    //let data = SubChainBase.registerAsMonitor.getData(monitoracct, this.Monitor);
    // urladdr monitor scs node main account"
    //console.log(data);
    try {
      let data = this.appChainInstance.getMonitorInfo();
      console.log(data);
    } catch (e) {
      console.error(e);
    }
  }

  set VnodeBenificial(addr) {
    this._VnodeBenificialAddr = addr;
  }

  get VnodeBenificial() {
    return this._VnodeBenificialAddr;
  }

  // 设置用户
  setMainAccount(acct, pass) {
    this._mainaccount = acct;
    this._password = pass;
  }

  get MainAccount() {
    return this._mainaccount;
  }
  get MainAccountPassword() {
    return this._password;
  }

  set ERC20ContractAddr(erc20addr) {
    this._ERC20Addr = erc20addr;
  }
  get ERC20ContractAddr() {
    return this._ERC20Addr;
  }

  // 准备子链多应用(智能合约)的基础合约发布,supply为token数量
  prepareMulti(priv, supply) {
    let me = this;
    let nna = "";
    if (priv == undefined || priv == false) {
      nna = '/DappBasePrivate.sol';
    } else if (priv) {
      nna = '/DappBasePublic.sol';
    }
    let solfile = SolDir + nna; //当前目录下的sol 目录为智能合约目录
    let contract = fs.readFileSync(solfile, 'utf8');
    let output = solc.compile(contract, 1);
    let abi = output.contracts[':DappBase'].interface;
    let bin = output.contracts[':DappBase'].bytecode;

    let via = this.VnodeBenificial;

    if (via == undefined || via == "") {
      console.log("请先赋值Vnodebenificial address");
      return;
    }
    this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);
    let amount = supply; // 注意：amount分别对应subchainbase的tokensupply和erc20的totalsupply，细节详见母应用链货币交互章节
    this.chain3.mc.sendTransaction({
      from: this.MainAccount,
      value: this.chain3.toSha(amount, 'mc'),
      to: this._addr,
      gas: 0,
      shardingFlag: "0x3",
      data: '0x' + bin,
      nonce: 0,
      via: via,
    }, function (e, hash) {
      console.log(hash);
      //me.waitBlock(hash);
      me.waitForMicroChainBlocks(me._addr, 10);
      console.log("Should see nonce change to 1:", me.chain3.scs.getNonce(me._addr, me.MainAccount));
      console.log("Should see DAPP address on:", me._addr, "\n at: ", me.chain3.scs.getDappAddrList(me._addr));
    });

  }
  // 在dappbase 安装成功的基础上,安装dapp(智能合约)
  deployDapp(stfilename, contractname) {

    console.log("MicroChain:%s \tstate: %s\tblocknumber:%d", this._addr, this.chain3.scs.getDappState(this._addr), this.chain3.scs.getBlockNumber(this._addr));
    console.log("DAPP list:%s\nNonce:%d", this.chain3.scs.getDappAddrList(this._addr), this.chain3.scs.getNonce(this._addr, this.MainAccount));

    var dappfilename = SolDir + "/" + stfilename;
    var content = fs.readFileSync(dappfilename, 'utf8');

    let output = solc.compile(content, 1);

    var key = Object.keys(output.contracts);
    console.log(key);
    //this is the comiled object
    var ctt = output.contracts[key];
    console.log(ctt);
    var bytecodes;
    var mcabis;
    if (ctt == null) {
      console.log("Contract CTT is empty!");
      console.log(key);

      if (key.length > 1 && contractname != undefined) {

        bytecodes = "0x" + output.contracts[contractname].bytecode;
        mcabis = JSON.parse(output.contracts[contractname].interface);
      } else {
        console.log("合约下内容为空");
        return
      }
    } else {
      bytecodes = "0x" + ctt.bytecode;
      mcabis = JSON.parse(ctt.interface);
    }


    //===============Step 3========================================================
    // Prepare and Send TX to VNODE to deploy the DAPP on the MicroChain;
    // Deploy the Dapp with correct nonce
    var inNonce = this.chain3.scs.getNonce(this._addr, this.MainAccount);

    console.log("Src nonce:", inNonce);

    // No need to pass the amount when deploying the DAPP
    var mchash = this.sendshardingflagtx(0, bytecodes, inNonce, '0x3');
    console.log("dappbase TX HASH:", mchash);

    // Check the DAPP status after deploy, need to wait for several blocks
    // If successful, you should see the new DAPP address
    this.waitMicroTransaction(mchash);

    console.log("Should see DAPP list on :", this._addr, "\n at: ", this.chain3.scs.getDappAddrList(this._addr));

  }

  getAbiFromSol(filename, name) {
    var dappfilename = SolDir + "/" + filename;
    var content = fs.readFileSync(dappfilename, 'utf8');

    let output = solc.compile(content, 1);

    var key = Object.keys(output.contracts);
    console.log(key);
    // abi = output.contracts[':MMCoin'].interface;
    //this is the comiled object
    var ctt = output.contracts[key];
    if (key.length > 1 && name == undefined) {
      console.log("请选择一个contrat 名称输出!");
      return;
    }
    /* if (ctt == null) {
      console.log("Contract CTT is empty!");
      return;
    } */
    //var bytecode = "0x" + ctt.bytecode;
    if (name != null || name != undefined) {
      //console.log(output.contracts);
      return JSON.parse(output.contracts[name].interface);
    } else {
      var mcabi = JSON.parse(ctt.interface);
      return mcabi;
    }

  }

  registerDapp(dappaddr, dappabi) {
    /*to: address of the deployed subchainbase contract;
    nonce：调用monitor的rpc接口ScsRPCMethod.GetNonce获得
    gas: 0 不需要消耗gas费用
    shardingflag： 0x1  表示子链调用操作
    via: 对应 proxy vnode 的收益地址
    data: 调用合约地址 + chain3.sha3("registerDapp(address,address,string)") 取前4个字节 0xb5560a14，加上传值凑足32个字节
    */

    let me = this;
    let inNonce = this.chain3.scs.getNonce(this._addr, this.MainAccount);
    console.log(inNonce);
    //let dappbaseContractBase = this.chain3.mc.contract(JSON.parse(this.ABIs.dappBaseABI));
    //let dappBaseContract = dappbaseContractBase.at(this.dappBaseContractAddr);
    let data = this.dappBaseContractAddr + this.dappContract.registerDapp.getData(dappaddr, this.MainAccount, dappabi).substring(2);
    console.log(data);
    this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);
    var tx = this.chain3.mc.sendTransaction({
      nonce: inNonce,
      from: this.MainAccount,
      value: 0,
      to: this._addr,
      gas: 0,
      shardingFlag: '0x1',
      data: data,
      via: this._VnodeBenificialAddr,
    });
    this.waitMicroTransaction(tx);
    console.log("Should see DAPP list on :", this._addr, "\n at: ", this.chain3.scs.getDappAddrList(this._addr));

    //this.sendshardingflagtx(0, bytecode, inNonce, '0x3');
  }

  printChain() {
    for (var i = 0; i < this.mclist.length; i++) {
      console.log("MicroChain ", this.mclist[i],
        "state: ", this.chain3.scs.getDappState(this.mclist[i]),
        " blockNumber: ", this.chain3.scs.getBlockNumber(this.mclist[i]));
      console.log("MC balance:", this.chain3.scs.getMicroChainInfo(this.mclist[i]).balance);
      console.log("DAPP list:", this.chain3.scs.getDappAddrList(this.mclist[i]));
    }
  }

  //返回sub chain状态,返回subchain调用对象
  get status() {
    let SubchainbaseContract = this.chain3.mc.contract(JSON.parse(this.ABIs.astABI));
    let mchain = SubchainbaseContract.at(this._addr);
    //mchain.getMonitorInfo.call();

    //call MicroChain methods
    console.log("============================================\nTest MicroChain functions");
    console.log("nodeCount:", mchain.nodeCount().toString());
    console.log("Microchain Info:\nBALANCE:", mchain.BALANCE().toString());
    console.log("via Reward:", mchain.viaReward().toString());
    console.log("flush Info:", mchain.getFlushInfo().toString());
    //=======================================================
    return mchain;
  }
  get decimals() {
    return this.appChainInstance.ERCDecimals();
  }

  collectChainInfo() {
    var result = {};
    result.address = this._addr;
    result.nodecount = this.appChainInstance.nodeCount().toString();
    result.balance = (this.appChainInstance.BALANCE() / Math.pow(10, decimals)).toString();
    result.flush = this.appChainInstance.getFlushInfo().toString();
    result.ercaddr = this.appChainInstance.ERCAddr();
    result.ercdecimal = this.appChainInstance.ERCDecimals();
    result.ercrate = this.appChainInstance.ERCRate();
    result.vnodepool = this.appChainInstance.VnodeProtocolBaseAddr();
    try {
      result.dapps = this.chain3.scs.getDappAddrList(this._addr);
      result.info = this.chain3.scs.getMicroChainInfo(this._addr);
    } catch (e) {
      console.log("some scs error", e);
    }
    result.nodes = this.mclist;
    this.chainInfo = result;
    return result;
  }

  get systemNumber() {
    let me = this;
    let result = {};
    return new Promise((res, rej) => {
      me.chain3.scs.getBlockNumber(me._addr, (err, data) => {
        result.height = data;
        result.supply = (this.appChainInstance.BALANCE() / Math.pow(10, decimals));
        res(result);
      });

    });
  }

  get blockNumber() {
    return this.chain3.scs.getBlockNumber(this._addr);
  }

  /// 获得maclist中第一个合约, 在multibase 的模式下,这个是dappbase 的合约对象
  get dappContract() {
    var mcabi = this.ABIs.astABI;//load in the MicroChain ABI from external file

    // Create the MicroChain Object with abi
    var mcObject = this.chain3.microchain(JSON.parse(mcabi));

    // Need to setup the via address
    mcObject.setVnodeAddress(this._VnodeBenificialAddr);

    // This enables the MICROCHAIN objec, which is a Global contract on the MotherChain
    var mchain = mcObject.at(this._addr);

    //call MicroChain methods
    console.log("============================================\nTest MicroChain functions");
    console.log("nodeCount:", mchain.nodeCount().toString());
    console.log("Microchain Info:\nBALANCE:", mchain.BALANCE().toString());
    console.log("via Reward:", mchain.viaReward().toString());
    console.log("flush Info:", mchain.getFlushInfo().toString());
    //=======================================================


    //Create a DappBase Object and test functions with it
    var baseabi = this.ABIs.dappBaseABI;//load in the DappBase ABI from external file
    var baseAddr = this.dappBaseContractAddr;

    // Create the MicroChain DappBase Object with abi and address
    var dappBase = mcObject.getDapp(this._addr, JSON.parse(baseabi), baseAddr);
    return dappBase;
  }

  getTotalSupply() {
    return this.appChainInstance.BALANCE();
  }
  // 以下是scs 的api 应用
  getBalance(acct) {

    if (acct) {
      return this.chain3.scs.getBalance(this._addr, acct) / Math.pow(10, decimals);
    } else {
      console.log("显示dappbase金额:")
      return this.chain3.scs.getBalance(this._addr, this.dappBaseContractAddr) / Math.pow(10, decimals);
    }

  }

  //getTransaction() { }
  //getAppChainInfo() { }
  getBlock(n) {
    return this.chain3.scs.getBlock(this._addr, this.chain3.toHex(n));
  }
  getBlocks(start, end) {
    this.appChain.getBlocks(start, end).then((blockListInfo) => {
      console.log(blockListInfo);
    });
  }
  getBlockNumber() {
    return this.chain3.scs.getBlockNumber(this._addr);
  }
  getNonce() {
    return this.chain3.scs.getNonce(this._addr, this.MainAccount);
  }
  getTxPool() {
    return this.chain3.scs.getTxpool(this._addr);
  }
  getTxpoolCount() { }
  getExchangeInfo() { }
  getExchangeByAddress() { }
  getTransactionByNonce(account, nonce) {
    return this.chain3.scs.getTransactionByNonce(this._addr, account, nonce);
  }
  getTransactionByHash(tx) {
    return this.chain3.scs.getTransactionByHash(this._addr, tx);
  }

  getReceiptByNonce(n) {
    return this.chain3.scs.getReceiptByNonce(this._addr, this.MainAccount, n);
  }

  getReceiptByHash(hash) {
    return this.chain3.scs.getReceiptByHash(this._addr, hash);
  }

  getDappInstance(dappaddr, filename, contractname) {
    console.log(contractname);
    var abi;
    if (contractname == undefined) {
      abi = this.getAbiFromSol(filename);
    } else {
      abi = this.getAbiFromSol(filename, contractname);
    }

    return this.appChainBase.getDapp(this._addr, abi, dappaddr);

  }

  //A simple tool to check all the account balances.and erc 20 coin
  checkBalance(addr) {

    var acctBal = this.chain3.fromSha(this.chain3.mc.getBalance(addr), "mc");
    var totalBal = parseFloat(acctBal);
    console.log(" balance: " + totalBal + " mc");


    var ercabi = this.getAbiFromSol("erc20.sol", ":MMCoin");
    // console.log(ercabi);
    var erc20 = this.chain3.mc.contract(ercabi).at(this.ERC20ContractAddr);
    let decimals = erc20.decimals();
    console.log("erc20 balance:", erc20.balanceOf(addr) / Math.pow(10, decimals));
    //}
  }

  //transfer erc20 to address with amount
  erc20Transfer(addressto, amount) {
    if (!this.ERC20ContractAddr) {
      console.error("请先设置erc20地址变量：ERC20ContractAddr");
      return;
    }
    var ercabi = this.getAbiFromSol("erc20.sol", ":MMCoin");
    var erc20 = this.chain3.mc.contract(ercabi).at(this.ERC20ContractAddr);
    let decimals = erc20.decimals();

    let value = amount * Math.pow(10, decimals);
    //let value = this.chain3.toSha(amount, 'mc');
    // call transfer function

    this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);
    let data = erc20.transfer.getData(addressto, value);
    var tx = this.chain3.mc.sendTransaction({
      from: this.MainAccount,
      value: 0,
      to: erc20.address,
      gas: "3000000",
      gasPrice: this.chain3.mc.gasPrice,
      data: data
    });
    this.waitBlock(tx);
  }
  // 充值,提币
  //需要先给地址erc充值, 然后需要一点moac作为燃气，才能做此交易。
  addFund(moacaddr, moacaddrpass, amount) {
    if (!this.ERC20ContractAddr) {
      console.error("请先设置erc20地址");
      return;
    }
    var ercabi = this.getAbiFromSol("erc20.sol", ":MMCoin");
    var erc20 = this.chain3.mc.contract(ercabi).at(this.ERC20ContractAddr);

    var data = erc20.approve.getData(this._addr, amount);
    //console.log(data);
    this.chain3.personal.unlockAccount(moacaddr, moacaddrpass);
    var ttx = this.chain3.mc.sendTransaction({
      from: moacaddr,
      value: 0,
      to: erc20.address,
      gas: "2000000",
      gasPrice: this.chain3.mc.gasPrice,
      data: data
    });
    console.log("approve tx", ttx);
    this.waitBlock(ttx);

    //SubChainBase = SubChainBaseContract.at(subchainaddr);
    this.chain3.personal.unlockAccount(moacaddr, moacaddrpass);
    data = this.appChainInstance.buyMintToken.getData(amount);

    var tx = this.chain3.mc.sendTransaction({
      from: moacaddr,
      value: 0,
      to: this._addr,
      gas: "2000000",
      gasPrice: this.chain3.mc.gasPrice,
      data: data
    });
    console.log("交易tx:", tx);
    this.waitBlock(tx);

  }

  // register a account
  registerAccount(privatekey, password) {
    try {
      var addr = this.chain3.personal.importRawKey(privatekey, password);
      console.log("地址为", add);
    } catch (e) {
      console.log(e);
    }
  }

  // make fund to address
  dappFund(address, pass, amount) {
    //根据ABI chain3.sha3("buyMintToken()") = 0x6bbded701cd78dee9626653dc2b2e76d3163cc5a6f81ac3b8e69da6a057824cb
    //  取前4个字节 0x6bbded70
    // amount = 1;
    //subchainaddr = '0xe9463e215315d6f1e5387a161868d7d0a4db89e8';
    let data = this.appChainInstance.buyMintToken.getData(amount);
    console.log(chain3.sha3("buyMintToken()"));
    console.log(data);
    this.chain3.personal.unlockAccount(address, pass);
    var tx = this.chain3.mc.sendTransaction({
      from: address,
      value: 0,
      to: this._addr,
      gas: "2000000",
      gasPrice: this.chain3.mc.gasPrice,
      // shardingFlag: '0x1',
      data: data,
      // via: this.VnodeBenificial
    });
    console.log("tx:", tx);
    this.waitBlock(tx);
    // this.waitMicroTransaction(tx);
  }

  withdraw(ma) {
    //nonce = 5       // 调用ScsRPCMethod.GetNonce获得
    //  subchainaddr = '0xb877bf4e4cc94fd9168313e00047b77217760930';
    // dappbassaddr = dappbase合约地址
    //  > via = '0xf103bc1c054babcecd13e7ac1cf34f029647b08c';
    var amount = this.chain3.toSha(ma, 'mc');    //   * 10的2次方(ERC20的decimals) / 10(兑换比率)   100 即为对应erc20数量
    let inNonce = this.chain3.scs.getNonce(this._addr, this.MainAccount);
    this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);
    var tx = this.chain3.mc.sendTransaction({
      nonce: inNonce,
      from: this.MainAccount,
      value: amount,
      to: this._addr,
      gas: 0,
      shardingFlag: '0x1',
      data: this.dappBaseContractAddr + '89739c5b',
      via: this._VnodeBenificialAddr,
    });
    console.log("tx:", tx);
    this.waitMicroTransaction(tx);

  }

  //关闭,维护
  closeAppChain() {
    //根据ABI chain3.sha3("close()") = 0x43d726d69bfad97630bc12e80b1a43c44fecfddf089a314709482b2b0132f662
    // 取前4个字节 0x43d726d6
    // > subchainaddr = '0x1195cd9769692a69220312e95192e0dcb6a4ec09';
    console.log("关闭应用链", this._addr);
    this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);
    var tx = this.chain3.mc.sendTransaction({
      from: this.MainAccount,
      value: 0,
      to: this._addr,
      gas: "2000000",
      gasPrice: this.chain3.mc.gasPrice,
      data: '0x43d726d6'
    });
    console.log("tx:", tx);
    this.waitBlock(tx);
  }

  //delay
  sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
      if ((new Date().getTime() - start) > milliseconds) {
        break;
      }
    }
  }
  selfLoop() {
    let me = this;
    /* 
        this.networkTimer = setInterval(() => {
          this.updateHeight();
          this.updateSupply();
          //  this.updateDelegates();
        }, 8 * 1000); */

    setInterval(() => {
      me.height = me.chain3.scs.getBlockNumber(me._addr);
      me.supply = me.getTotalSupply() / Math.pow(10, me.decimals);
      me.collectChainInfo()
      //put your code in here to be delayed by 2 seconds
    }, 8000);


  }
}
//exports.SubChain = SubChain;

module.exports = SubChain;


ac = new SubChain("http://127.0.0.1:8545", "0x624010ebdb9bfd16db98583a5048475582635c6a", "http://127.0.0.1:8548");