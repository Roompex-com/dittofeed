import {
  CreateNewFolder as CreateNewFolderIcon,
  Folder as FolderIcon,
  KeyboardArrowDown,
  KeyboardArrowRight,
} from "@mui/icons-material";
import {
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TableCell,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import {
  ContentFolder,
  ContentFolderResourceType,
} from "isomorphic-lib/src/types";
import React, { useCallback, useEffect, useState } from "react";

import {
  ALL_FOLDERS_FILTER,
  ROOT_FOLDER_FILTER,
  useUpsertContentFolderMutation,
} from "../../lib/useContentFolders";

const NEW_FOLDER_VALUE = "__new_folder__";

export function NewFolderDialog({
  open,
  onClose,
  resourceType,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  resourceType: ContentFolderResourceType;
  onCreated: (folderId: string) => void;
}) {
  const [name, setName] = useState("");

  const upsertFolderMutation = useUpsertContentFolderMutation({
    onSuccess: (folder) => {
      onCreated(folder.id);
      onClose();
    },
  });

  useEffect(() => {
    if (open) {
      setName("");
    }
  }, [open]);

  const handleCreate = () => {
    if (!name.trim() || upsertFolderMutation.isPending) {
      return;
    }
    upsertFolderMutation.mutate({
      name: name.trim(),
      resourceType,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create New Folder</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          id="name"
          label="Folder Name"
          type="text"
          fullWidth
          variant="standard"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter" && name.trim()) {
              handleCreate();
            }
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleCreate}
          disabled={!name.trim() || upsertFolderMutation.isPending}
        >
          {upsertFolderMutation.isPending ? "Creating..." : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Folder filter dropdown for resource list toolbars. Offers All folders /
 * Unfiled / each folder, plus a "New folder" affordance that creates a folder
 * of the given resourceType and selects it.
 */
export function FolderFilterSelect({
  resourceType,
  folders,
  value,
  onChange,
}: {
  resourceType: ContentFolderResourceType;
  folders: ContentFolder[];
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);

  return (
    <>
      <FormControl size="small" sx={{ minWidth: theme.spacing(20) }}>
        <InputLabel id={`folder-filter-label-${resourceType}`}>
          Folder
        </InputLabel>
        <Select
          labelId={`folder-filter-label-${resourceType}`}
          label="Folder"
          value={value}
          onChange={(e) => {
            const selected = e.target.value;
            if (selected === NEW_FOLDER_VALUE) {
              setNewFolderDialogOpen(true);
              return;
            }
            onChange(selected);
          }}
        >
          <MenuItem value={ALL_FOLDERS_FILTER}>All folders</MenuItem>
          <MenuItem value={ROOT_FOLDER_FILTER}>Unfiled</MenuItem>
          {folders.length > 0 && <Divider />}
          {folders.map((folder) => (
            <MenuItem key={folder.id} value={folder.id}>
              {folder.name}
            </MenuItem>
          ))}
          <Divider />
          <MenuItem value={NEW_FOLDER_VALUE}>
            <CreateNewFolderIcon fontSize="small" sx={{ mr: 1 }} />
            New folder…
          </MenuItem>
        </Select>
      </FormControl>
      <NewFolderDialog
        open={newFolderDialogOpen}
        onClose={() => setNewFolderDialogOpen(false)}
        resourceType={resourceType}
        onCreated={(folderId) => onChange(folderId)}
      />
    </>
  );
}

/**
 * Required folder selector for resource creation dialogs. Lists folders of
 * the given resourceType plus a "New folder" affordance; no unfiled option
 * is offered. The parent form is responsible for blocking creation until a
 * folder is chosen, passing `error` to surface inline validation.
 */
export function RequiredFolderSelect({
  resourceType,
  folders,
  value,
  onChange,
  error = false,
}: {
  resourceType: ContentFolderResourceType;
  folders: ContentFolder[];
  value: string | null;
  onChange: (folderId: string) => void;
  error?: boolean;
}) {
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);

  return (
    <>
      <FormControl size="small" fullWidth error={error}>
        <InputLabel id={`required-folder-label-${resourceType}`}>
          Folder *
        </InputLabel>
        <Select
          labelId={`required-folder-label-${resourceType}`}
          label="Folder *"
          value={value ?? ""}
          onChange={(e) => {
            const selected = e.target.value;
            if (selected === NEW_FOLDER_VALUE) {
              setNewFolderDialogOpen(true);
              return;
            }
            onChange(selected);
          }}
        >
          {folders.map((folder) => (
            <MenuItem key={folder.id} value={folder.id}>
              {folder.name}
            </MenuItem>
          ))}
          <Divider />
          <MenuItem value={NEW_FOLDER_VALUE}>
            <CreateNewFolderIcon fontSize="small" sx={{ mr: 1 }} />
            New folder…
          </MenuItem>
        </Select>
        {error && <FormHelperText>Folder is required.</FormHelperText>}
      </FormControl>
      <NewFolderDialog
        open={newFolderDialogOpen}
        onClose={() => setNewFolderDialogOpen(false)}
        resourceType={resourceType}
        onCreated={(folderId) => onChange(folderId)}
      />
    </>
  );
}

/**
 * Dialog offering a folder choice (including "No folder" / Unfiled) for the
 * "Move to folder" row action.
 */
export function MoveToFolderDialog({
  open,
  onClose,
  folders,
  currentFolderId,
  resourceName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  folders: ContentFolder[];
  currentFolderId: string | null | undefined;
  resourceName: string | undefined;
  onConfirm: (folderId: string | null) => void;
}) {
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (open) {
      setSelected(currentFolderId ?? "");
    }
  }, [open, currentFolderId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Move{resourceName ? ` "${resourceName}"` : ""} to folder
      </DialogTitle>
      <DialogContent>
        <FormControl fullWidth size="small" sx={{ mt: 1 }}>
          <InputLabel id="move-to-folder-label">Folder</InputLabel>
          <Select
            labelId="move-to-folder-label"
            label="Folder"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <MenuItem value="">
              <em>No folder (Unfiled)</em>
            </MenuItem>
            {folders.map((folder) => (
              <MenuItem key={folder.id} value={folder.id}>
                {folder.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onConfirm(selected === "" ? null : selected)}>
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Local (unpersisted) expansion state for folder groups in a resource list
 * table. Folders are collapsed by default; the unfiled/root group is not
 * collapsible and always rendered expanded.
 */
export function useFolderExpansion() {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleFolderExpanded = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  return { expandedFolders, toggleFolderExpanded };
}

/**
 * Section header row grouping a resource table's rows by folder. When
 * `onToggle` is provided the header becomes a collapsible toggle button
 * (chevron + folder name + item count, full-row click target, keyboard
 * accessible); otherwise it renders as a static section header.
 */
export function FolderGroupHeaderRow({
  label,
  colSpan,
  count,
  expanded = false,
  onToggle,
}: {
  label: string;
  colSpan: number;
  count?: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const theme = useTheme();
  const collapsible = typeof onToggle === "function";

  const content = (
    <Stack direction="row" spacing={1} alignItems="center">
      {collapsible &&
        (expanded ? (
          <KeyboardArrowDown
            fontSize="small"
            sx={{ color: "text.secondary" }}
          />
        ) : (
          <KeyboardArrowRight
            fontSize="small"
            sx={{ color: "text.secondary" }}
          />
        ))}
      <FolderIcon fontSize="small" sx={{ color: "text.secondary" }} />
      <Tooltip title={label} placement="bottom-start">
        <Typography
          variant="subtitle2"
          color="text.secondary"
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </Typography>
      </Tooltip>
      {typeof count === "number" && (
        <Typography variant="caption" color="text.secondary">
          ({count})
        </Typography>
      )}
    </Stack>
  );

  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        sx={
          collapsible
            ? { p: 0, bgcolor: "action.hover" }
            : { py: theme.spacing(0.5), bgcolor: "action.hover" }
        }
      >
        {collapsible ? (
          <ButtonBase
            onClick={onToggle}
            aria-expanded={expanded}
            sx={{
              display: "flex",
              width: "100%",
              justifyContent: "flex-start",
              py: theme.spacing(0.5),
              px: 2,
              textAlign: "left",
              "&:hover": { bgcolor: "action.selected" },
            }}
          >
            {content}
          </ButtonBase>
        ) : (
          content
        )}
      </TableCell>
    </TableRow>
  );
}
