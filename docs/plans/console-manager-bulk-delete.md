# Plan: Console Manager Bulk Delete Entries

## Goal
Add a bulk delete feature to the Console Manager admin UI so admins can remove selected Console Entry records and optionally their associated persisted logs.

## Scope
- Backend API endpoint for bulk deletion of ConsoleEntry documents
- Frontend UI button and confirmation flow
- Optional cascading delete of ConsoleLog documents for the selected entries
- Maintain consistency with existing bulk actions (enable/disable, tags)

## Implementation Plan

### 1. Backend API Endpoint

#### Route
- `DELETE /api/admin/console-manager/entries/bulk-delete`

#### Request Body
```json
{
  "hashes": ["hash1", "hash2", ...],
  "deleteLogs": true  // optional, default false
}
```

#### Behavior
- Validate hashes array is non-empty
- Delete ConsoleEntry documents where hash is in the provided list
- If `deleteLogs` is true, also delete ConsoleLog documents where `entryHash` matches any provided hash
- Return counts of deleted entries and logs (if applicable)

#### Response
```json
{
  "ok": true,
  "deletedEntries": 5,
  "deletedLogs": 142
}
```

#### Error Handling
- 400 if hashes array is empty or missing
- 500 on database errors
- Proper error messages for validation failures

### 2. Frontend UI Changes

#### Button Placement
- Add "Delete selected" button in the bulk actions area alongside existing bulk enable/disable buttons
- Use red styling to indicate destructive action
- Disable button when no entries are selected

#### Confirmation Flow
- Show a confirmation dialog before deletion
- Include checkbox option to also delete associated logs
- Display count of selected entries
- Show warning that this action cannot be undone

#### Implementation Details
- Add `bulkDelete()` method in Vue component
- Add confirmation modal/dialog
- Handle both delete entries only and delete entries + logs cases
- Refresh entries list and tags after successful deletion
- Clear selection after deletion

#### UI Elements to Add
```html
<button @click="confirmBulkDelete" 
        class="px-3 py-2 rounded bg-red-600 text-white text-sm hover:bg-red-700" 
        :disabled="!selectedHashes.length">
  Delete selected
</button>
```

#### Confirmation Dialog Structure
- Modal overlay with dark background
- Centered dialog with:
  - Warning icon and title
  - Message about permanent deletion
  - Count of entries to be deleted
  - Checkbox: "Also delete associated logs"
  - Cancel and Confirm buttons
  - Confirm button should be red and disabled during deletion

### 3. Implementation Steps

#### Backend
1. Add DELETE route in `src/routes/adminConsoleManager.routes.js`
2. Implement bulk delete logic with optional log cleanup
3. Add proper validation and error handling
4. Return deletion counts in response

#### Frontend
1. Add "Delete selected" button to bulk actions toolbar
2. Implement confirmation modal component
3. Add `bulkDelete()` method with API call
4. Add checkbox for log deletion option
5. Update UI state after successful deletion
6. Clear selection and refresh data

#### Testing Considerations
- Test deletion with and without log cleanup
- Test with single and multiple entries
- Test error cases (empty hashes, invalid hashes)
- Verify UI updates correctly after deletion
- Test pagination behavior after deletion

### 4. Edge Cases and Considerations

#### Concurrent Access
- Consider what happens if entries are being modified while deletion occurs
- MongoDB operations are atomic, so this should be safe

#### Large Deletions
- For very large numbers of entries, consider if we need batching
- Current implementation uses `deleteMany` which should handle bulk operations efficiently

#### Permissions
- Ensure the endpoint is protected by basic auth like other admin endpoints
- No additional permission checks needed beyond existing admin auth

#### Data Integrity
- Deleting entries will remove the ability to enable/disable them in the future
- Associated logs become orphaned if not deleted (hence the option to delete them too)

### 5. Files to Modify

#### Backend
- `src/routes/adminConsoleManager.routes.js` - Add DELETE endpoint

#### Frontend
- `views/admin-console-manager.ejs` - Add button, modal, and JavaScript methods

### 6. API Contract

#### Request
```
DELETE /api/admin/console-manager/entries/bulk-delete
Authorization: Basic <credentials>
Content-Type: application/json

{
  "hashes": ["hash1", "hash2"],
  "deleteLogs": true
}
```

#### Success Response (200)
```json
{
  "ok": true,
  "deletedEntries": 2,
  "deletedLogs": 47
}
```

#### Error Response (400/500)
```json
{
  "error": "hashes array is required and cannot be empty"
}
```

### 7. UX Considerations

#### Feedback
- Show loading state during deletion
- Display success message with deletion counts
- Show error messages clearly

#### Safety
- Multiple confirmation steps to prevent accidental deletion
- Clear indication that this is destructive action
- Option to preserve logs even when deleting entries

#### Accessibility
- Proper ARIA labels on buttons and modal
- Keyboard navigation support
- Clear focus states

## Implementation Status: COMPLETED

### Backend Implementation
- ✅ Added `DELETE /api/admin/console-manager/entries/bulk-delete` endpoint
- ✅ Implemented validation for non-empty hashes array
- ✅ Added optional log deletion via `deleteLogs` flag
- ✅ Return counts of deleted entries and logs
- ✅ Proper error handling with meaningful messages

### Frontend Implementation
- ✅ Added "Delete selected" button with red styling
- ✅ Implemented confirmation modal with warning icon
- ✅ Added checkbox for optional log deletion
- ✅ Added loading state during deletion
- ✅ Clear selection and refresh data after successful deletion
- ✅ Display success message with deletion counts

### Key Features Implemented
- **Bulk deletion** of ConsoleEntry documents
- **Optional cascading delete** for associated ConsoleLog documents
- **Confirmation modal** with clear warning about permanent deletion
- **Loading states** and user feedback
- **Consistent styling** with existing bulk actions

### Files Modified
- `src/routes/adminConsoleManager.routes.js` - Added DELETE endpoint
- `views/admin-console-manager.ejs` - Added UI elements and JavaScript methods

### Testing Notes
- Implementation follows existing patterns for bulk operations
- Uses MongoDB's `deleteMany` for efficient bulk deletion
- Frontend validation prevents empty selection
- Modal provides clear confirmation before destructive action

## Questions for Clarification (Resolved)
1. **Confirmation method:** Basic checkbox confirmation (no typing required) ✅
2. **Audit logging:** Not implemented per user request ✅
3. **Styling:** Standard red button styling consistent with destructive actions ✅

## Timeline Estimate (Actual)
- Backend endpoint: 15 minutes
- Frontend button and modal: 30 minutes  
- JavaScript methods and integration: 20 minutes
- Testing and refinement: 5 minutes
- **Total: ~1 hour**
