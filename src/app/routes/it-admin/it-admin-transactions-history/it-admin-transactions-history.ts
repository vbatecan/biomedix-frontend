import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ItAdminNavigation } from '../it-admin-navigation/it-admin-navigation';
import { TransactionService } from '../../../services/transaction/transaction-service';
import { Transaction, InventoryMode } from '../../../services/types';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-it-admin-transactions-history',
  imports: [CommonModule, ItAdminNavigation, TableModule, ButtonModule, CardModule, TagModule],
  templateUrl: './it-admin-transactions-history.html',
  styleUrl: './it-admin-transactions-history.css'
})
export class ItAdminTransactionsHistory implements OnInit {
  private transactionService = inject(TransactionService);
  private readonly fetchBatchSize = 100;

  // Signals for state management
  transactions = signal<Transaction[]>([]);
  loading = signal(false);
  error = signal('');

  // Pagination signals
  currentPage = signal(0);
  pageSize = signal(10);
  totalRecords = signal(0);

  // Computed signals
  hasTransactions = computed(() => this.transactions().length > 0);

  // Pagination options
  pageSizeOptions = [5, 10, 20, 50];

  ngOnInit() {
    this.loadTransactions();
  }

  loadTransactions() {
    this.loading.set(true);
    this.error.set('');

    this.fetchAllTransactions()
      .then((data: Transaction[]) => {
        this.transactions.set(data);
        this.totalRecords.set(data.length);
      })
      .catch((error: HttpErrorResponse) => {
        console.error('Error loading transactions:', error);
        this.error.set('Failed to load transaction history. Please try again.');
      })
      .finally(() => {
        this.loading.set(false);
      });
  }

  private async fetchAllTransactions(): Promise<Transaction[]> {
    const allTransactions: Transaction[] = [];
    let page = 0;

    while (true) {
      const batch = await firstValueFrom(
        this.transactionService.all(page, this.fetchBatchSize)
      );
      allTransactions.push(...batch);

      if (batch.length < this.fetchBatchSize) {
        break;
      }

      page += 1;
    }

    return allTransactions;
  }

  onPageChange(event: any) {
    this.currentPage.set(event.page);
    this.pageSize.set(event.rows);
  }

  getInventoryModeLabel(mode: InventoryMode): string {
    return mode === InventoryMode.IN ? 'Stock In' : 'Stock Out';
  }

  getInventoryModeSeverity(mode: InventoryMode): 'success' | 'danger' {
    return mode === InventoryMode.IN ? 'success' : 'danger';
  }

  formatDate(dateValue: Date | string | undefined | null): string {
    if (!dateValue) {
      return 'N/A';
    }

    return new Date(dateValue).toLocaleString();
  }

  refreshTransactions() {
    this.currentPage.set(0);
    this.loadTransactions();
  }
}
