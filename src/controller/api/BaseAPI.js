import QueryString from 'query-string'
import { REQUEST_TYPE } from 'common/constants'
import { KEY_STORE } from 'common/constants/keystore'
import { getItemStorage } from 'common/functions'
import crypto from 'crypto-js'
import { store } from 'controller/redux/store/configureStore'
import { get } from 'lodash'

export default class BaseAPI {

  // constructor(linkServer, token) {
  //   this.linkServer = linkServer;
  //   this.token = token;
  // }

  static async getData (type, queryBody, options) {
    return this.postGateWay(
      type,
      REQUEST_TYPE.GET,
      undefined,
      queryBody,
      null,
      options
    )
  }

  static async postData (type, body, options) {
    return this.postGateWay(type, REQUEST_TYPE.POST, body, null, null, options)
  }

  static async putData (type, body) {
    return this.postGateWay(type, REQUEST_TYPE.PUT, body)
  }

  static async deleteData (type, body) {
    return this.postGateWay(type, REQUEST_TYPE.DELETE, undefined, body)
  }

  static async putDataView (type, body) {
    return this.postGateWay(type + '/view', REQUEST_TYPE.PUT, body)
  }

  static async postGetCommonPair (typeTrade, currencyIn, currencyOut) {
    const body = {
      typeTrade,
      currencyIn,
      currencyOut
    }

    return this.postGateWay('ammRouter/commonPair', REQUEST_TYPE.POST, body)
  }

  static async postGateWay (
    url,
    method = REQUEST_TYPE.GET,
    body,
    queryBody,
    linkServer,
    options
  ) {
    try {
      const serverUrl = window.swapLinkServer
      const spamToken = getItemStorage(KEY_STORE.SPAM_TOKEN)

      const storeState = store.getState()
      const langRedux = get(storeState, 'langRedux')

      let queryStr = ''
      let queryFly

      if (queryBody) {
        queryFly = QueryString.stringify(queryBody)
        queryStr = '?' + queryFly
      }

      const params = {
        method,
        headers: {
          Source: process.env.REACT_APP_SOURCE_API,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Version: process.env.REACT_APP_VERSION,
          Authorization: 'Bearer ' + window.swapToken,
          locale: langRedux

        },
        ...options
      }

      let passwordHash = ''

      if (body) {
        params.body = JSON.stringify(body)
      }

      if (method !== REQUEST_TYPE.GET) {
        passwordHash = JSON.stringify(body || {})
      } else {
        passwordHash = queryBody ? QueryString.stringify(queryBody) : {}
      }

      const hashPassword = crypto.HmacSHA256(passwordHash, spamToken || '')
      params.headers.Signature = hashPassword
      const response = await fetch(serverUrl + url + queryStr, params)

      const responJson = await response.json()

      if (response.status === 200) {
        return responJson
      }

      if (response.status === 400) {
        return responJson
      }

      return null
    } catch (error) {
      console.log(error)
      return null
    }
  }
}
