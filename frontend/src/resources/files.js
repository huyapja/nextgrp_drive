import { toast } from "@/utils/toasts"
import { createResource } from "frappe-ui"

import router from "@/router"
import store from "@/store"
import { prettyData, setCache } from "@/utils/files"

// GETTERS
export const COMMON_OPTIONS = {
  method: "GET",
  debounce: 500,
  onError(error) {
    if (error && error.exc_type === "PermissionError") {
      store.commit("setError", {
        primaryMessage: "Forbidden",
        secondaryMessage: "Insufficient permissions for this resource",
      })
      router.replace({ name: "Error" })
    }
  },
  transform(data) {
    // Frappe-ui automatically extracts message field, but handle both cases
    let actualData = data
    
    // If data is wrapped in message field (frappe response format)
    if (data && typeof data === 'object' && 'message' in data && data.message) {
      actualData = data.message
    }
    
    // Handle paginated response
    if (actualData && typeof actualData === 'object' && 'data' in actualData && Array.isArray(actualData.data)) {
      return {
        ...actualData,
        data: prettyData(actualData.data)
      }
    }
    // Handle non-paginated response (backward compatibility)
    return prettyData(actualData)
  },
}

export const getHome = createResource({
  ...COMMON_OPTIONS,
  url: "drive.api.list.files",
  makeParams: (params) => {
    return {
      ...params,
      personal: 0,
      order_by: "title 1",
    }
  },
  cache: "home-folder-contents",
})

export const getTeams = createResource({
  url: "/api/method/drive.api.permissions.get_teams",
  params: {
    details: 1,
  },
  method: "GET",
  cache: "teams",
})

export const getRecents = createResource({
  ...COMMON_OPTIONS,
  url: "drive.api.list.get_recent_files_multi_team",
  cache: "recents-folder-contents",
  makeParams: (params) => {
    return { ...params, recents_only: true, personal: -2 }
  },
  transform(data) {
    if (!data) return data

    // Frappe-ui automatically extracts message field, but handle both cases
    let actualData = data
    
    // If data is wrapped in message field (frappe response format)
    if (data && typeof data === 'object' && 'message' in data && data.message) {
      actualData = data.message
    }

    // Handle paginated response {data: [...], total: X, page: Y, page_size: Z}
    if (actualData && typeof actualData === 'object' && actualData !== null && !Array.isArray(actualData) && 'data' in actualData) {
      if (Array.isArray(actualData.data)) {
        const transformedData = actualData.data.map((item) => ({
          ...item,
          team_name: item.is_private === 1 ? null : item.team_name,
        }))
        return {
          ...actualData,
          data: prettyData(transformedData)
        }
      } else {
        // If data field exists but is not an array, log warning
        console.warn('getRecents: data field is not an array:', actualData)
        return actualData
      }
    }
    
    // Handle non-paginated response (backward compatibility - array)
    if (Array.isArray(actualData)) {
      const transformedData = actualData.map((item) => ({
      ...item,
      team_name: item.is_private === 1 ? null : item.team_name,
    }))
    return prettyData(transformedData)
    }

    // If actualData is not an array and not a paginated response, return as is
    // This handles edge cases where API might return something unexpected
    console.warn('getRecents: Unexpected data format:', actualData)
    return actualData
  },
})

export const getPersonal = createResource({
  ...COMMON_OPTIONS,
  url: "drive.api.list.files_multi_team",
  cache: "personal-folder-contents",
  makeParams: (params) => {
    return { ...params, personal: 1, order_by: "title 1" }
  },
})

export const getFavourites = createResource({
  ...COMMON_OPTIONS,
  url: "drive.api.list.get_favourites_multi_team",
  cache: "favourite-folder-contents",
  makeParams: (params) => {
    return { ...params, favourites_only: true, personal: -2, order_by: "title 1" }
  },
  transform(data) {
    if (!data) return data

    // Frappe-ui automatically extracts message field, but handle both cases
    let actualData = data
    
    // If data is wrapped in message field (frappe response format)
    if (data && typeof data === 'object' && 'message' in data && data.message) {
      actualData = data.message
    }

    // Handle paginated response {data: [...], total: X, page: Y, page_size: Z}
    if (actualData && typeof actualData === 'object' && actualData !== null && !Array.isArray(actualData) && 'data' in actualData) {
      if (Array.isArray(actualData.data)) {
        const transformedData = actualData.data.map((item) => ({
          ...item,
          team_name: item.is_private === 1 ? null : item.team_name,
        }))
        return {
          ...actualData,
          data: prettyData(transformedData)
        }
      } else {
        // If data field exists but is not an array, log warning
        console.warn('getFavourites: data field is not an array:', actualData)
        return actualData
      }
    }
    
    // Handle non-paginated response (backward compatibility - array)
    if (Array.isArray(actualData)) {
      const transformedData = actualData.map((item) => ({
      ...item,
      team_name: item.is_private === 1 ? null : item.team_name,
    }))
    return prettyData(transformedData)
    }

    // If actualData is not an array and not a paginated response, return as is
    // This handles edge cases where API might return something unexpected
    console.warn('getFavourites: Unexpected data format:', actualData)
    return actualData
  },
})

export const getShared = createResource({
  ...COMMON_OPTIONS,
  url: "drive.api.list.shared_multi_team",
  cache: "shared-folder-contents",
  makeParams: (params) => {
    // Merge với params hiện tại để giữ các params khác
    const currentParams = getShared.params || {}
    
    // Luôn lấy 'by' từ store state để đảm bảo đúng giá trị
    const shareView = store.state.shareView
    const byValue = params?.by ?? currentParams?.by ?? (shareView === "with" ? 0 : 1)
    
    return {
      ...currentParams, // Giữ params hiện tại
      ...params, // Override với params mới
      by: byValue, // Đảm bảo 'by' luôn có giá trị đúng từ store
      order_by: params.order_by || currentParams.order_by || "title 1"
    }
  },
  transform(data) {
    if (!data) return data
    
    // Frappe-ui automatically extracts message field, but handle both cases
    let actualData = data
    if (data && typeof data === 'object' && 'message' in data && data.message) {
      actualData = data.message
    }
    
    // Handle paginated response
    if (actualData && typeof actualData === 'object' && 'data' in actualData && Array.isArray(actualData.data)) {
      const transformedData = actualData.data.map((item) => ({
        ...item,
        team_name: item.is_private === 1 ? null : item.team_name,
      }))
      return {
        ...actualData,
        data: prettyData(transformedData)
      }
    }
    
    // Handle non-paginated response (backward compatibility)
    if (Array.isArray(actualData)) {
      const transformedData = actualData.map((item) => ({
        ...item,
        team_name: item.is_private === 1 ? null : item.team_name,
      }))
      return prettyData(transformedData)
    }
    
    return data
  },
})

export const getTrash = createResource({
  ...COMMON_OPTIONS,
  url: "drive.api.list.get_trash_files",
  cache: "trash-folder-contents",
  makeParams: (params) => {
    return { ...params, is_active: 0, personal: -3 }
  },
  transform(data) {
    if (!data) return data

    let actualData = data
    if (data && typeof data === 'object' && 'message' in data && data.message) {
      actualData = data.message
    }

    if (actualData && typeof actualData === 'object' && 'data' in actualData && Array.isArray(actualData.data)) {
      const transformedData = actualData.data.map((item) => ({
        ...item,
        team_name: item.is_private === 1 ? null : item.team_name,
      }))
      return {
        ...actualData,
        data: prettyData(transformedData)
      }
    }

    if (Array.isArray(actualData)) {
      const transformedData = actualData.map((item) => ({
        ...item,
        team_name: item.is_private === 1 ? null : item.team_name,
      }))
      return prettyData(transformedData)
    }

    return data
  },
})

// SETTERS
export const LISTS = [
  getPersonal,
  getHome,
  getRecents,
  getShared,
  getFavourites,
]
export const mutate = (entities, func) => {
  LISTS.forEach((l) =>
    l.setData((d) => {
      if (!d) return
      entities.forEach(({ name, ...params }) => {
        let el = {}

        if (params.is_shortcut) {
          el = d.find((k) => k.shortcut_name === params.shortcut_name)
          if (el) {
            func(el, params)
          }
        } else {
          el = d.find((k) => k.name === name)
          if (el) {
            func(el, params)
          }
        }
      })
      return d
    })
  )
}

export const updateMoved = (new_parent, team) => {
  if (new_parent && team) {
    // All details are repetetively provided (check Folder.vue) because if this is run first
    // No further mutation of the resource object can take place
    createResource({
      ...COMMON_OPTIONS,
      url: "drive.api.list.files_multi_team",
      makeParams: (params) => ({
        ...params,
        entity_name: new_parent,
        personal: -2,
        team,
      }),
      cache: ["folder", new_parent],
    }).fetch({
      order_by:
        store.state.sortOrder.field +
        (store.state.sortOrder.ascending ? " 1" : " 0"),
    })
  } else {
    ;(move.params.is_private ? getPersonal : getHome).fetch({ team })
  }
}

const handleFilterFavourite = (entity) => {
  if (entity.is_shortcut) {
    return entity.shortcut_name
  } else {
    return entity.name
  }
}

export const toggleFav = createResource({
  url: "drive.api.files.set_favourite",
  makeParams(data) {
    // Clear all favourites
    if (!data) {
      console.log("toggleFav data", data)
      getFavourites.setData([])
      mutate(getFavourites.data, (el) => (el.is_favourite = false))
      return { clear_all: true }
    }
    
    getFavourites.setData((d) => {
      if (!d) return d
      
      // Handle paginated response {data: [...], total: X, page: Y, page_size: Z}
      let favouritesArray = []
      let isPaginated = false
      let paginationMeta = {}
      
      if (typeof d === 'object' && 'data' in d && Array.isArray(d.data)) {
        // Paginated response
        isPaginated = true
        favouritesArray = d.data
        paginationMeta = {
          total: d.total,
          page: d.page,
          page_size: d.page_size
        }
      } else if (Array.isArray(d)) {
        // Non-paginated response (array)
        favouritesArray = d
      } else {
        console.warn('toggleFav: Unexpected getFavourites data format:', d)
        return d
      }
      
      const currentFavourites = new Set(
        favouritesArray.map((item) => (item.is_shortcut ? item.shortcut_name : item.name))
      )

      let updatedFavourites = [...favouritesArray]
      let removedCount = 0

      data.entities.forEach((entity) => {
        const entityId = entity.is_shortcut ? entity.shortcut_name : entity.name

        if (entity.is_favourite) {
          // Thêm vào favourites nếu chưa có
          if (!currentFavourites.has(entityId)) {
            const temp = { ...entity }
            updatedFavourites.push(temp)
            currentFavourites.add(entityId)
          }
        } else {
          // Xóa khỏi favourites nếu có
          const beforeLength = updatedFavourites.length
          updatedFavourites = updatedFavourites.filter((item) => {
            const itemId = item.is_shortcut ? item.shortcut_name : item.name
            return itemId !== entityId
          })
          if (updatedFavourites.length < beforeLength) {
            removedCount++
          currentFavourites.delete(entityId)
        }
        }
      })

      // Return in the same format as input
      if (isPaginated) {
        return {
          ...paginationMeta,
          total: Math.max(0, (paginationMeta.total || 0) - removedCount),
          data: updatedFavourites
        }
      } else {
      return updatedFavourites
      }
    })
    
    // QUAN TRỌNG: Gửi đúng format cho backend
    return {
      entities: data.entities.map(entity => {
        const payload = {
          name: entity.name,
          is_favourite: entity.is_favourite, // GIỮ NGUYÊN GIÁ TRỊ TỪ DATA
        }
        
        // Chỉ thêm shortcut_name và is_shortcut nếu đây là shortcut
        if (entity.is_shortcut) {
          payload.shortcut_name = entity.shortcut_name
          payload.is_shortcut = true
        }
        
        return payload
      }),
    }
  },
  onSuccess() {
    // Kiểm tra trường hợp clear all
    if (!toggleFav.params.entities) {
      toast(__("All favourites cleared"))
      return
    }
    
    // Trường hợp toggle 1 item: không hiển thị toast
    if (toggleFav.params.entities.length === 1) {
      toast(toggleFav.params.entities[0].is_favourite
        ? __("Đã được thêm vào danh sách Yêu thích.")
        : __("Bỏ yêu thích thành công."))
      return
    }
    
    // Trường hợp toggle nhiều items
    if (toggleFav.params.entities[0].is_favourite === false) {
      toast(
        __("{0} items unfavourited").format(toggleFav.params.entities.length)
      )
    } else {
      toast(__("{0} items favourited").format(toggleFav.params.entities.length))
    }
  },
})
export const clearRecent = createResource({
  url: "drive.api.files.remove_recents",
  makeParams: (data) => {
    if (!data) {
      getRecents.setData([])
      return { clear_all: true }
    }
    
    // Handle both { entities: [...] } and direct array
    const entities = data.entities || (Array.isArray(data) ? data : [])
    
    if (!Array.isArray(entities) || entities.length === 0) {
      console.warn('clearRecent: Invalid entities format', data)
      return { clear_all: false, entity_names: [] }
    }
    
    const entity_names = entities.map((entity) => {
      // Handle both entity object and entity name string
      if (typeof entity === 'string') {
        return entity
      }
      return entity.name || entity.shortcut_name || entity
    }).filter(Boolean)
    
    // Update local data - handle both paginated and non-paginated response
    const currentData = getRecents.data
    if (currentData) {
      if (typeof currentData === 'object' && 'data' in currentData && Array.isArray(currentData.data)) {
        // Paginated response
        const filteredData = currentData.data.filter(({ name, shortcut_name, is_shortcut }) => {
          const entityName = is_shortcut ? shortcut_name : name
          return !entity_names.includes(entityName)
        })
        getRecents.setData({
          ...currentData,
          data: filteredData,
          total: Math.max(0, (currentData.total || 0) - entity_names.length)
        })
      } else if (Array.isArray(currentData)) {
        // Non-paginated response
        const filteredData = currentData.filter(({ name, shortcut_name, is_shortcut }) => {
          const entityName = is_shortcut ? shortcut_name : name
          return !entity_names.includes(entityName)
        })
        getRecents.setData(filteredData)
      }
    }
    
    return {
      entity_names,
    }
  },
  onSuccess: () => {
    const files = clearRecent.params?.entity_names?.length || 0
    if (files > 0) {
    toast(
        __("Đã xóa {0} tệp khỏi Gần đây.").format(files)
          )
    }
    // Reload data to ensure consistency
    getRecents.fetch()
  },
})

const handleClearTrash = (entities) => {
  const items = Array.isArray(entities) ? entities : entities?.data || []
  if (!items?.length) return
  return items.map((entity) => {
    if (entity.is_shortcut) {
      return {
        entity: entity.shortcut_name,
        is_shortcut: true,
      }
    } else {
      return {
        entity: entity.name,
        is_shortcut: false,
      }
    }
  })
}

export const clearTrash = createResource({
  url: "drive.api.files.delete_entities",
  makeParams: (data) => {
    if (!data) {
      return { clear_all: true }
    }
    return { entity_names: handleClearTrash(getTrash.data) }
  },
  onSuccess: (data) => {
    getTrash.setData([])

    toast(
      data.message || __("Trash cleared successfully.")
    )
  },
})

export const rename = createResource({
  url: "drive.api.files.call_controller_method",
  method: "POST",
  makeParams: (data) => {
    return {
      method: "rename",
      ...data,
    }
  },
  onError(error) {
    console.log("rename error", error)
    toast({
      title: JSON.stringify(error).includes("PermissionError")
        ? __("Bạn không có quyền thực hiện hành động này")
        : __("There was an error"),
      position: "bottom-right",
      timeout: 2,
    })
  },
})

export const renameShortcut = createResource({
  url: "drive.api.files.call_controller_method",
  method: "POST",
  makeParams: (data) => {
    return {
      method: "rename_shortcut",
      ...data,
    }
  },
  onError(error) {
    toast({
      title: JSON.stringify(error).includes("PermissionError")
        ? __("Bạn không có quyền thực hiện hành động này")
        : __("There was an error"),
      position: "bottom-right",
      timeout: 2,
    })
  },
})

export const createDocument = createResource({
  method: "POST",
  url: "drive.api.files.create_document_entity",
  makeParams: (params) => params,
})

export const createMindMap = createResource({
  method: "POST",
  url: "drive.api.mindmap.create_mindmap_entity",
  makeParams: (params) => params,
})


export const togglePersonal = createResource({
  method: "POST",
  url: "drive.api.files.call_controller_method",
  makeParams: (params) => ({ ...params, method: "toggle_personal" }),
  onSuccess: (e) => {
    let index = getPersonal.data.findIndex((k) => k.name === e)
    getHome.setData((data) => {
      data.push(getPersonal.data[index])
      return data
    })

    getPersonal.setData((data) => {
      data.splice(index, 1)
      return data
    })
  },
})

export const move = createResource({
  url: "drive.api.files.move",
  // onSuccess(data) {
  //   toast({
  //     title: __("Moved to") + " " + data.title,
  //     buttons: [
  //       {
  //         label: __("Go"),
  //         action: () => {
  //           openEntity(null, {
  //             name: data.name,
  //             team: data.team,
  //             is_group: true,
  //             is_private: data.is_private,
  //           })
  //         },
  //       },
  //     ],
  //   })

  //   // Update moved-into folder
  //   // updateMoved(data.name, data.team, data.is_private, data.is_shortcut)
  // },
  onError() {
    toast(__("There was an error."))
  },
})

export const allFolders = createResource({
  method: "GET",
  url: "drive.api.list.files_multi_team",
  cache: "all-folders",
  makeParams: (params) => ({
    ...params,
    is_active: 1,
    folders: 1,
    personal: -1,
    only_parent: 0,
    order_by: "title 1"
  }),
  transform: (d) =>
    d.map((k) => ({
      value: k.name,
      label: k.title,
      parent: k.parent_entity,
      is_private: k.is_private,
    })),
})

export const translate = createResource({
  method: "GET",
  url: "/api/method/drive.api.files.get_translate",
  cache: "translate",
})

setCache(getHome, "home-folder-contents")
setCache(getShared, "shared-folder-contents")
setCache(getRecents, "recents-folder-contents")
setCache(getFavourites, "favourite-folder-contents")
setCache(getPersonal, "personal-folder-contents")
setCache(getTrash, "trash-folder-contents")
