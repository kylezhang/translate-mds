const tjs = require('translation.js')
const chalk = require('chalk')
const {logger} = require('../config/loggerConfig.js')
// get config.json
const configs = require('../config.json')
let tranF, tranT
tranF = configs['from']
tranT = configs['to']
logger.level = configs.logger.level

// Fix result.length no equal
const { translateLengthEquals } = require("./Fix/lengthEqual.js")
const { fixFileTooBig, thirdArray } = require("./Fix/fixFileTooBig.js")


// 
// get translate result

/**
 * @description 
 * @param {String|String[]} value 
 * @param {String} api 
 * @returns {String[]}
 */
async function translateValue(value, api){
    let thisTranString
    if(value instanceof Array){
        thisTranString = value.join('\n')
    }else{
      thisTranString = value
    }
    if(api == 'youdao' && tranT === 'zh'){
      tranT = tranT + '-CN'
    }
    // logger.log('debug',thisTranString,value,'----- first')
    return tjs.translate({
                      text: thisTranString,
                      api: api,
                      from: tranF,
                      to: tranT
                    }).then(result => {
                      if(!result.result){
                        throw new Error('「结果为空」')
                      }

                      
                      if(value.length ==  result.result.length){
                        return result.result
                      }
                      
                      // logger.log('error',value.length)
                      if(value.length > result.result.length){
                        return translateValue(value.slice(result.result.length),api).then(youdao =>{
                          // tjs translate youdao BUG and tjs baidu will return undefined
                          if(youdao){
                            if(youdao instanceof Array){
                              youdao.forEach(x => result.result.push(x))
                            }else{
                              result.result.push(youdao)
                            }
                          }
                          // logger.log('debug',JSON.stringify(result.result,null,2),chalk.cyan('集合 --------中 '))
                          return result.result
                      
                        }).catch(x => logger.error(`${youdao}炸了`,x))
                        // Promise.reject("bad youdao fanyi no get \\n")

                      }

                      // // Bug translate.js return result.result Array
                      // if(value.length < result.result.length){
                        
                      //   logger.debug(`___________
                      //   get the result is not equal , so + the final result\n 
                      //   ************`)
                      //   let r_v = result.result.length - value.length
                      //   for(let i= 0;i<r_v;i++){
                      //     result.result[value.length-1] += result.result[value.length + i]
                      //   }
                      //   // when \n in text medium，return 2 size Array
                      //   return result.result
                      // }
                      return result.result

                    }).catch(error => {
                      if(!error.code){
                        logger.debug(api,chalk.red( error,'tjs-程序错误'))
                      }else{
                        logger.debug(api,chalk.red( error.code,'出现了啦，不给数据'))
                      }
                      return ""

                    })
      
}

/**
 * @description translate AST Key == value, return new Object 
 * @param {Object} obj - AST
 * @param {String} api - defuault api
 * @returns {Object} - newObject 
 */
async function setObjectKey(obj, api) {

    let allAPi = ['baidu','google','youdao']
    let tranArray = []
    let thisTranArray = []
    let resultArray = []
    let newObj = JSON.parse(JSON.stringify(obj))
    let sum = 0 // single values
    /**
     * @description Find ``obj['type'] === 'value'`` ,and``tranArray.push(obj[key])``
     * @param {Object} obj 
     * @param {String[]} tranArray 
     * @returns {number} - find value number
     */
    function deep(obj, tranArray) {
      Object.keys(obj).forEach(function(key) {
        
        // no translate code content
      if(obj['type'] && ( obj['type'] === 'html' || obj['type'] === 'code')){
        return sum
      }
      (obj[key] && typeof obj[key] === 'object') && deep(obj[key], tranArray)
      

      if(key === 'value' && obj[key].trim()){
            tranArray.push(obj[key])
            sum++
      }
      });
      return sum
    };

    /**
     * @description Find ``obj['type'] === 'value'``, and use ``tranArrayZh.shift`` set ``obj['value']`` 
     * @param {any} obj - AST
     * @param {String[]} tranArrayZh 
     * @returns 
     */
    function setdeep(obj, tranArrayZh) {
      Object.keys(obj).forEach(function(key) {
        
      if(obj['type'] && ( obj['type'] === 'html' || obj['type'] === 'code')){
          return sum
      }
      
      (obj[key] && typeof obj[key] === 'object') && setdeep(obj[key], tranArrayZh)
  
      if(key === 'value' && obj[key].trim()){
            if(tranArrayZh.length){
              obj[key] = tranArrayZh.shift()
              sum--
            }
      }
      });
      return sum
      };

    // put obj values to tranArray
    if(!deep(obj, tranArray)){      
      logger.error('no value', sum)
      return false
    }

    if(tranArray.length){
      // remove all \n
      tranArray = tranArray.map(x=>{
        if(x.indexOf('\n')>=0){
          return x.replace(/[\n]/g,'')
        }
        return x
      })
      thisTranArray = tranArray
      tranArray = []
    }
    
          

    // Fix file Too Big
    let chunkTranArray = fixFileTooBig(thisTranArray)  
    let hasThird = thirdArray(chunkTranArray)
    let getI = hasThird.map(x =>x[0])
    
    for(let third in chunkTranArray){

      // auto change translate source
      allAPi = allAPi.filter(x => x!=api)
      allAPi.push(api)
      for(let i in allAPi){

        let thisResult = []
        logger.log('debug',chalk.yellow('使用',api,'\n')) 

        if((hasThird.length > 0) && getI.includes(third)){
          let t0 = await translateValue(chunkTranArray[third][0], api)
          let t1 = await translateValue(chunkTranArray[third][1], api)
          
          thisResult = t0.concat(t1)
          // console.log(thisResult)

        }else if(hasThird.length == 0){
          thisResult = await translateValue(chunkTranArray[third], api)
        }

        api = allAPi[i]

        if(thisResult.length > 0 ){
          // console.log(thisResult.length)

          resultArray.push(thisResult)
          const upFirst = (sum, val) => sum.concat(val);
          resultArray = resultArray.reduce(upFirst, [])
          break
        }

      }
    }

    if(resultArray.length == 0){
      logger.error(`
      获取信息错误,原因有3
      - 网络失联
      - 翻译源 失败 > 文件太大了
      - 抽风
      `)
      return false
    }
    
    if(resultArray.length < thisTranArray.length){
      logger.debug(`只有一部分翻译成功`)
    }

    // Fix use Fix/lengthEqual.js
    if(thisTranArray.length < resultArray.length){     
                     
      translateLengthEquals(thisTranArray, resultArray)

      logger.debug(chalk.yellow(`获得 ${api} 数据了~`));
      // get zh and -> write down same folder { me.md => me.zh.md }
                     
      for (i in resultArray){
        
        logger.log('debug','set- '+ chalk.green(thisTranArray[i]) + ' to-> '+ chalk.yellow(resultArray[i]))
        
      }               
      
    }
    

    logger.log('debug',chalk.whiteBright('Result -->>'),chalk.green(resultArray))
    setdeep(newObj, resultArray) // [[1],[2]] => [1,2]
    
    return newObj
}

module.exports = { setObjectKey, translateValue }