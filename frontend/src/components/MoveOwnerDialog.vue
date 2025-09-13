<template>
  <Dialog
    v-model="openDialog"
    :options="{ size: 'lg', dialogClass: 'fixed-height-dialog' }"
  >
    <template #body-main>
      <div class="move-owner-container">
        <!-- Header với tên file -->
        <div class="dialog-header">
          <h3 class="dialog-title">Chuyển quyền sở hữu</h3>
          <p class="file-name">{{ entity?.title || entity?.name || 'Không có tên' }}</p>
        </div>

        <!-- Form chuyển quyền -->
        <div class="dialog-content">
          <!-- Chọn người dùng mới -->
          <div class="field-group">
            <label class="field-label">Chọn chủ sở hữu mới:</label>
            <Dropdown
              v-model="selectedUser"
              :options="getTeamMembers"
              optionLabel="full_name"
              optionValue="user"
              placeholder="Chọn người dùng"
              class="user-dropdown"
              filter
              :filterFields="['full_name', 'email']"
              emptyMessage="Không có dữ liệu"
              emptyFilterMessage="Không tìm thấy người dùng phù hợp"
            >
              <template #option="slotProps">
                <div class="user-option">
                  <CustomAvatar 
                    :image="slotProps.option.user_image" 
                    :label="slotProps.option.full_name?.charAt(0)" 
                    size="small"
                    shape="circle"
                    class="user-avatar"
                  />
                  <div class="user-info">
                    <span class="user-name">{{ slotProps.option.full_name }}</span>
                  </div>
                </div>
              </template>
              <template #value="slotProps">
                <div v-if="slotProps.value" class="selected-user">
                  <CustomAvatar
                    :image="getSelectedUserData()?.user_image" 
                    :label="getSelectedUserData()?.full_name?.charAt(0)" 
                    size="small"
                    shape="circle"
                    class="user-avatar"
                  />
                  <span>{{ getSelectedUserData()?.full_name }}</span>
                </div>
              </template>
            </Dropdown>
          </div>

          <!-- Radio buttons cho quyền của chủ cũ -->
          <div class="field-group">
            <label class="field-label">Quyền của tôi sau khi chuyển:</label>
            <div class="radio-group">
              <div class="radio-item">
                <RadioButton
                  v-model="ownerPermission"
                  inputId="view"
                  name="permission"
                  value="0"
                />
                <label for="view" class="radio-label">
                  Quyền xem
                </label>
              </div>
              <div class="radio-item">
                <RadioButton
                  v-model="ownerPermission"
                  inputId="edit"
                  name="permission"
                  value="1"
                />
                <label for="edit" class="radio-label">
                  Quyền chỉnh sửa
                </label>
              </div>
            </div>
          </div>

          <!-- Loading và error states -->
          <div v-if="loading" class="loading-container">
            <ProgressSpinner size="small" />
            <span>Đang tải danh sách người dùng...</span>
          </div>

          <Message v-if="error" severity="error" :closable="false">
            {{ error }}
          </Message>
        </div>

        <!-- Action buttons -->
        <div class="dialog-actions">
          <Button
            label="Hủy"
            severity="secondary"
            outlined
            @click="handleCancel"
            :disabled="submitting"
          />
          <Button
            label="Chuyển"
            @click="handleTransfer"
            :loading="submitting"
            :disabled="!selectedUser || !ownerPermission"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { userList } from "@/resources/permissions";
import { toast } from "@/utils/toasts";
import {
  createResource,
  Dialog
} from "frappe-ui";
import Button from 'primevue/button';
import Dropdown from 'primevue/dropdown';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import RadioButton from 'primevue/radiobutton';
import { computed, ref, watch } from 'vue';
import { useStore } from "vuex";
import CustomAvatar from "./CustomAvatar.vue";

const props = defineProps({ 
  modelValue: String, 
  entity: Object 
})
const emit = defineEmits(["update:modelValue", "success"])
const store = useStore()
// Reactive data
const selectedUser = ref(null)
const ownerPermission = ref("0") // Default là quyền xem
const loading = ref(false)
const error = ref('')
const submitting = ref(false)

const openDialog = computed({
  get: () => {
    return props.modelValue === "move_owner"
  },
  set: (value) => {
    emit("update:modelValue", value ? "move_owner" : "")
  },
})

const userId = computed(() => store.state.user.id)

const getTeamMembers = computed(() => {
  if (userList.data?.length > 0) {
    return userList.data.filter(u => u.user !== userId.value)
  }
  return []
})

const getSelectedUserData = () => {
  return getTeamMembers.value.find(user => user.user === selectedUser.value)
}

const handleCancel = () => {
  resetForm()
  openDialog.value = false
}

const moveOwnerResource = createResource({
  url: 'frappe.client.call',     
  doc: 'Drive File',                    // Tên DocType
     method: 'move_owner',                 // Tên method trong class
     name: props.entity?.name,             // ID của document
     args: {                               // Arguments cho method
       new_owner: selectedUser.value,
       old_owner_permissions: ownerPermission.value,
     }
,
  onSuccess: (data) => {
    console.log('Move owner success:', data)
    toast("Đã chuyển quyền sở hữu thành công!")
    
    emit('success', {
      new_owner: selectedUser.value,
      old_owner_permission: ownerPermission.value
    })
    
    resetForm()
    openDialog.value = false
  },
  onError: (error) => {
    console.error("Move owner error:", error)
    const errorMessage = error.messages?.[0] || "Không thể chuyển quyền sở hữu. Vui lòng thử lại."
    error.value = errorMessage
  },            
})

const handleTransfer = async () => {
  if (!selectedUser.value || !ownerPermission.value) return
  if (!props.entity?.name) {
    error.value = 'Không tìm thấy thông tin file'
    return
  }

  submitting.value = true
  error.value = ''
  
  try { 
    await moveOwnerResource.submit()
    
    // Xử lý response ngay tại đây nếu cần
    console.log('Response:', response)
    
    emit('success', {
      new_owner: selectedUser.value,
      old_owner_permission: ownerPermission.value
    })
    
    resetForm()
    openDialog.value = false
    
  } catch (err) {
    error.value = err.message || 'Có lỗi xảy ra khi chuyển quyền sở hữu'
    console.error('Error transferring ownership:', err)
  } finally {
    submitting.value = false
  }
}

const resetForm = () => {
  selectedUser.value = null
  ownerPermission.value = "0"
  error.value = ''
}

// Watchers
watch(openDialog, (newValue) => {
  if (newValue) {
    resetForm()
  }
})

</script>

<style scoped>
.move-owner-container {
  padding: 16px 24px;
}

.dialog-header {
  margin-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 6px;
}

.dialog-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 2px 0;
}

.file-name {
  color: #6b7280;
  font-size: 0.875rem;
  margin: 0;
  font-weight: 500;
}

.dialog-content {
  margin-bottom: 24px;
}

.field-group {
  margin-bottom: 20px;
}

.field-label {
  display: block;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
  font-size: 0.875rem;
}

.user-dropdown {
  width: 100%;
}

.user-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0px 0;
}

.user-avatar {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-weight: 500;
  color: #1f2937;
  font-size: 14px;
}

.user-email {
  font-size: 0.75rem;
  color: #6b7280;
}

.selected-user {
  display: flex;
  align-items: center;
  gap: 8px;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  color: #374151;
}

.permission-icon {
  width: 16px;
  height: 16px;
  color: #6b7280;
}

.loading-container {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7280;
  font-size: 0.875rem;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

/* Override PrimeVue styles */
:deep(.p-dropdown) {
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

:deep(.p-dropdown:not(.p-disabled):hover) {
  border-color: #9ca3af;
}

:deep(.p-dropdown:not(.p-disabled).p-focus) {
  outline: 0 none;
  outline-offset: 0;
  box-shadow: 0 0 0 2px #bfdbfe;
  border-color: #3b82f6;
}

:deep(.p-radiobutton .p-radiobutton-box) {
  border-color: #d1d5db;
}

:deep(.p-radiobutton .p-radiobutton-box.p-highlight) {
  border-color: #3b82f6;
  background: #3b82f6;
}

/* Fixed height dialog styles */
:deep(.fixed-height-dialog) {
  height: 600px !important;
  max-height: 600px !important;
  overflow: hidden;
}

:deep(.fixed-height-dialog .dialog-content) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.fixed-height-dialog .dialog-body) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>