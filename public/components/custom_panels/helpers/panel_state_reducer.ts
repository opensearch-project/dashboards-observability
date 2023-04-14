import { CUSTOM_PANELS_SAVED_OBJECT_TYPE } from "common/constants/custom_panels"
import { coreRefs } from "public/framework/core_refs"


const FETCH = 'fetch'

/*
** ACTIONS 
*/
const fetchPanel = (id) => ({ type: FETCH, id })

export const Actions = { fetchPanel }



