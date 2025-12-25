import router from "@/router";
import store from "@/store";
import { prettyData } from "@/utils/files";
import { createResource } from "frappe-ui";

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
    return prettyData(data)
  },
}

export const getTeamMembers = createResource({
  url: "drive.api.product.get_all_users",
  makeParams: () => {
    const team = router.currentRoute.value?.params?.team;
    if (!team) throw new Error('Team parameter is required');
    return { team };
  },
  auto: false // Set auto: false để tự điều khiển việc gọi API
})


export const getCommentMembers = createResource({
  url: "drive.api.product.get_all_users_without_team",
  auto: true
})