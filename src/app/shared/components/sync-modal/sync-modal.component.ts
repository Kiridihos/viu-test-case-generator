import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SyncResult } from '../../../core/models/test-case.model';

@Component({
  selector: 'app-sync-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sync-modal.component.html',
  styleUrls: ['./sync-modal.component.scss']
})
export class SyncModalComponent {
  @Input({ required: true }) syncResult!: SyncResult;
  @Input() organization: string = '';
  @Output() close = new EventEmitter<void>();

  onClose(): void {
    this.close.emit();
  }

  getWorkItemUrl(id: number): string {
    if (this.organization && this.syncResult?.project) {
      return `https://dev.azure.com/${this.organization}/${this.syncResult.project}/_workitems/edit/${id}`;
    }
    return '#';
  }
}
